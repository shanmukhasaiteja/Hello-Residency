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

/** score = 2 * sharedTags + sharedOpenTo + sameCohort + sameProgram */
export function score(me: Profile, other: Profile): number {
  const openTo = new Set(me.open_to);
  const sharedOpenTo = other.open_to.filter((o) => openTo.has(o)).length;
  const sameCohort = norm(me.cohort) !== '' && norm(me.cohort) === norm(other.cohort) ? 1 : 0;
  const sameProgram = norm(me.program) !== '' && norm(me.program) === norm(other.program) ? 1 : 0;
  return 2 * sharedTags(me, other).length + sharedOpenTo + sameCohort + sameProgram;
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
  return [p.name, p.program, p.cohort, p.research_topic, p.bio, p.tags.join(' ')]
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
