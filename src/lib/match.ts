// Pure helpers for matching, relations and safe rendering. No Supabase or React here.
import type { Intro, Profile, Relation } from './types';

export const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

/** Splits comma-separated input into at most 8 lowercased, deduplicated tags. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function sharedTags(a: Profile, b: Profile): string[] {
  const mine = new Set(a.tags);
  return b.tags.filter((t) => mine.has(t));
}

/** This-or-that picks two people agree on. */
export function agreements(a: Profile, b: Profile): string[] {
  const mine = new Set(a.this_or_that);
  return b.this_or_that.filter((x) => mine.has(x));
}

/** score = 2 * sharedTags + sharedOpenTo + sameCohort + sameProgram + 1 per 2 this-or-that agreements */
export function score(me: Profile, other: Profile): number {
  const openTo = new Set(me.open_to);
  const sharedOpenTo = other.open_to.filter((o) => openTo.has(o)).length;
  const sameCohort = norm(me.cohort) !== '' && norm(me.cohort) === norm(other.cohort) ? 1 : 0;
  const sameProgram = norm(me.program) !== '' && norm(me.program) === norm(other.program) ? 1 : 0;
  const vibes = Math.floor(agreements(me, other).length / 2);
  return 2 * sharedTags(me, other).length + sharedOpenTo + sameCohort + sameProgram + vibes;
}

/**
 * How `meId` relates to `otherId`. A declined intro still reads as "sent" to the
 * sender (no rejection notice), and is hidden from the recipient.
 */
export function relation(meId: string, otherId: string, intros: Intro[]): Relation {
  let sent = false;
  let incoming = false;
  for (const i of intros) {
    const outgoing = i.from_id === meId && i.to_id === otherId;
    const incomingIntro = i.from_id === otherId && i.to_id === meId;
    if (!outgoing && !incomingIntro) continue;
    if (i.status === 'accepted') return 'connected';
    if (outgoing) sent = true;
    if (incomingIntro && i.status === 'pending') incoming = true;
  }
  if (incoming) return 'incoming';
  if (sent) return 'sent';
  return 'none';
}

/** Top `limit` people the user has not contacted yet, best score first, score 0 hidden. */
export function suggestions(me: Profile, people: Profile[], intros: Intro[], limit = 6): Profile[] {
  return people
    .filter((p) => p.id !== me.id && relation(me.id, p.id, intros) === 'none')
    .map((p) => ({ p, s: score(me, p) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map(({ p }) => p);
}

/** Lowercased text that search matches against. */
export function searchText(p: Profile): string {
  return [p.name, p.program, p.cohort, p.research_topic, p.bio, p.prompt_answer, p.tags.join(' ')]
    .filter(Boolean)
    .join(' \u0000 ')
    .toLowerCase();
}

/** Every whitespace-separated term in the query must appear somewhere. */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => haystack.includes(t));
}

/** Most common tags across everyone, most frequent first. */
export function popularTags(people: Profile[], limit = 10): string[] {
  const counts = new Map<string, number>();
  for (const p of people) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Pre-filled hi message; mentions a shared tag when there is one. */
export function defaultMessage(me: Profile, other: Profile): string {
  const shared = sharedTags(me, other);
  const hi = `Hi ${firstName(other.name)}, I'm ${firstName(me.name)}`;
  if (shared.length > 0) return `${hi}. I saw we're both into ${shared[0]}. Want to grab a coffee and compare notes?`;
  if (other.prompt && other.prompt_answer)
    return `${hi}. "${other.prompt.replace(/…$/, '')} ${other.prompt_answer}" made me smile. Want to chat sometime this week?`;
  if (other.research_topic) return `${hi}. Your work on ${other.research_topic} sounds interesting. Want to chat sometime this week?`;
  return `${hi}. Want to say hi in person sometime this week?`;
}

export const BAND_COLORS = ['#0B7A7C', '#F4B63F', '#6B4C9A', '#B93A4C', '#2F5DA8'] as const;

/** Badge band color, chosen by hashing cohort, falling back to program, then name. */
export function bandColor(p: Pick<Profile, 'cohort' | 'program' | 'name'>): { bg: string; fg: string } {
  const key = norm(p.cohort) || norm(p.program) || norm(p.name);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const bg = BAND_COLORS[h % BAND_COLORS.length];
  return { bg, fg: bg === '#F4B63F' ? '#15233B' : '#FFFFFF' };
}

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;

/**
 * A safe href for a contact string, or null to render it as plain text.
 * Only mailto:, tel:, http: and https: are ever produced, never javascript: or data:.
 */
export function contactHref(contact: string): string | null {
  const value = contact.trim();
  if (EMAIL_RE.test(value)) return `mailto:${value}`;
  if (PHONE_RE.test(value) && /\d{7,}/.test(value.replace(/\D/g, ''))) return `tel:${value.replace(/[^\d+]/g, '')}`;
  const candidate = /^https?:\/\//i.test(value) ? value : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) ? `https://${value}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Local calendar day as YYYY-MM-DD, so the match changes at local midnight. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * One person to meet today: picked from the top 10 not-yet-contacted matches, or from
 * everyone not yet contacted when nobody scores. Stable for the whole day.
 */
export function matchOfTheDay(me: Profile, people: Profile[], intros: Intro[], date: Date): Profile | null {
  const candidates = people
    .filter((p) => p.id !== me.id && relation(me.id, p.id, intros) === 'none')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length === 0) return null;
  const scored = candidates
    .map((p) => ({ p, s: score(me, p) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id))
    .slice(0, 10)
    .map(({ p }) => p);
  const pool = scored.length > 0 ? scored : candidates;
  return pool[hash(`${me.id}:${dayKey(date)}`) % pool.length];
}

/** A short reason to meet, shown with the match of the day. */
export function matchReason(me: Profile, other: Profile): string {
  const shared = sharedTags(me, other);
  if (shared.length > 1) return `You both like ${shared.slice(0, -1).join(', ')} and ${shared[shared.length - 1]}.`;
  if (shared.length === 1) return `You both like ${shared[0]}.`;
  const agree = agreements(me, other).length;
  if (agree >= 3) return `You agree on ${agree} of 5 this-or-thats.`;
  const openTo = other.open_to.find((o) => me.open_to.includes(o));
  if (openTo) return `You're both up for: ${openTo.toLowerCase()}.`;
  if (norm(me.cohort) && norm(me.cohort) === norm(other.cohort)) return "You're in the same cohort.";
  if (norm(me.program) && norm(me.program) === norm(other.program)) return "You're in the same program.";
  return 'Someone new to meet today.';
}

/** Rough distance label. Distances arrive pre-rounded to 50 m by the server. */
export function distanceLabel(meters: number | null): string | null {
  if (meters === null) return null;
  if (meters <= 50) return 'Within 50 m';
  if (meters < 1000) return `About ${meters} m away`;
  return `About ${(meters / 1000).toFixed(1)} km away`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
