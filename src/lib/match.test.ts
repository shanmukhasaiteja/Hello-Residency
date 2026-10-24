import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactHref, defaultMessage, parseTags, relation, score, suggestions } from './match.ts';
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
