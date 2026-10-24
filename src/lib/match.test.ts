import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactHref, defaultMessage, distanceLabel, matchOfTheDay, parseTags, relation, score, suggestions, timeAgo } from './match.ts';
import type { Intro, Profile } from './types.ts';

const p = (id: string, extra: Partial<Profile> = {}): Profile => ({
  id, name: `Person ${id}`, program: null, cohort: null, research_topic: null, bio: null,
  tags: [], open_to: [], created_at: '2026-01-01T00:00:00Z', ...extra,
});
const intro = (from_id: string, to_id: string, status: Intro['status']): Intro => ({
  id: `${from_id}-${to_id}`, from_id, to_id, message: 'hi', reply: null, status, created_at: '',
});

test('parseTags lowercases, trims, dedupes and caps at 8', () => {
  assert.deepEqual(parseTags(' ML, ml ,#NLP,, Causal  Inference '), ['ml', 'nlp', 'causal inference']);
  assert.equal(parseTags('a,b,c,d,e,f,g,h,i,j').length, 8);
});

test('score weights shared tags double and counts cohort and program', () => {
  const me = p('a', { tags: ['ml', 'nlp'], open_to: ['Coffee chat'], cohort: '2026', program: 'CS' });
  const other = p('b', { tags: ['nlp', 'ml', 'art'], open_to: ['Coffee chat', 'Study buddy'], cohort: '2026', program: 'cs ' });
  assert.equal(score(me, other), 2 * 2 + 1 + 1 + 1);
  assert.equal(score(p('a'), p('b')), 0);
});

test('relation: accepted wins, declined still reads as sent to the sender', () => {
  assert.equal(relation('a', 'b', []), 'none');
  assert.equal(relation('a', 'b', [intro('a', 'b', 'pending')]), 'sent');
  assert.equal(relation('a', 'b', [intro('a', 'b', 'declined')]), 'sent');
  assert.equal(relation('b', 'a', [intro('a', 'b', 'declined')]), 'none');
  assert.equal(relation('b', 'a', [intro('a', 'b', 'pending')]), 'incoming');
  assert.equal(relation('a', 'b', [intro('a', 'b', 'pending'), intro('b', 'a', 'accepted')]), 'connected');
});

test('suggestions skip self, contacted people and score 0', () => {
  const me = p('me', { tags: ['ml'] });
  const people = [me, p('x', { tags: ['ml'] }), p('y', { tags: ['ml'] }), p('z')];
  assert.deepEqual(suggestions(me, people, [intro('me', 'y', 'pending')]).map((s) => s.id), ['x']);
});

test('defaultMessage mentions a shared tag', () => {
  assert.match(defaultMessage(p('a', { name: 'Alice', tags: ['ml'] }), p('b', { name: 'Bob', tags: ['ml'] })), /into ml/);
});

test('contactHref only allows safe schemes', () => {
  assert.equal(contactHref('a@b.co'), 'mailto:a@b.co');
  assert.equal(contactHref('+1 (555) 123-4567'), 'tel:+15551234567');
  assert.equal(contactHref('linkedin.com/in/alice'), 'https://linkedin.com/in/alice');
  assert.equal(contactHref('javascript:alert(1)'), null);
  assert.equal(contactHref('data:text/html,hi'), null);
  assert.equal(contactHref('@alice on Signal'), null);
});

test('matchOfTheDay is stable within a day, skips contacted people, prefers scorers', () => {
  const me = p('me', { tags: ['ml'] });
  const people = [me, p('x', { tags: ['ml'] }), p('y'), p('z', { tags: ['ml'] })];
  const day = new Date(2026, 9, 24, 9);
  const first = matchOfTheDay(me, people, [], day);
  assert.ok(first && ['x', 'z'].includes(first.id));
  assert.equal(matchOfTheDay(me, people, [], new Date(2026, 9, 24, 22))?.id, first?.id);
  assert.equal(matchOfTheDay(me, people, [intro('me', 'x', 'pending'), intro('me', 'z', 'pending')], day)?.id, 'y');
  assert.equal(matchOfTheDay(me, [me], [], day), null);
});

test('distanceLabel and timeAgo', () => {
  assert.equal(distanceLabel(null), null);
  assert.equal(distanceLabel(50), 'Within 50 m');
  assert.equal(distanceLabel(350), 'About 350 m away');
  assert.equal(distanceLabel(1250), 'About 1.3 km away');
  const now = Date.parse('2026-10-24T12:00:00Z');
  assert.equal(timeAgo('2026-10-24T11:48:00Z', now), '12 min ago');
  assert.equal(timeAgo('2026-10-24T10:30:00Z', now), '1 h ago');
});
