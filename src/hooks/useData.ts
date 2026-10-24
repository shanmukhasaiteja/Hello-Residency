// The app's data layer: loads everything the signed-in user can see and wraps every write.
// All privacy is enforced by Row Level Security; this hook only reads what RLS returns.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AVATAR_BUCKET, supabase } from '../lib/supabase';
import { squarePhoto } from '../lib/image';
import { friendlyError } from '../lib/errors';
import type { Block, Contact, Intro, IntroStatus, Meetup, MeetupDraft, MeetupJoin, Profile, ProfileDraft } from '../lib/types';

const REFRESH_MS = 30_000;
const REFRESH_JITTER_MS = 5_000;
/** Supabase returns at most 1000 rows per request, so profiles are loaded in pages of this size. */
const PAGE_SIZE = 1000;
const FULL_SYNC_MS = 10 * 60 * 1000;
/** Meetups that started more than this long ago are hidden. */
const MEETUP_GRACE_MS = 3 * 60 * 60 * 1000;

export type Notify = (message: string, kind?: 'ok' | 'error') => void;

export interface AppData {
  profiles: Profile[];
  intros: Intro[];
  contacts: Map<string, string>;
  meetups: Meetup[];
  joins: MeetupJoin[];
  /** People the signed-in user has blocked. */
  blocks: Block[];
  /** Unread chat messages, counted per sender. */
  unread: Map<string, number>;
}

const EMPTY: AppData = { profiles: [], intros: [], contacts: new Map(), meetups: [], joins: [], blocks: [], unread: new Map() };

interface Options {
  notify: Notify;
  /** Polling skips a refresh while this returns true (typing, modal open). */
  isPaused: () => boolean;
}

function countBySender(rows: { sender_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.sender_id, (counts.get(r.sender_id) ?? 0) + 1);
  return counts;
}

function orNull(value: string): string | null {
  const v = value.trim();
  return v === '' ? null : v;
}

export function useData(userId: string, { notify, isPaused }: Options) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);
  // Set when a refresh is asked for mid-flight (usually right after a write). The running
  // refresh then discards its possibly stale result and another one runs straight after.
  const queued = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const fail = useCallback((error: unknown, fallback?: string) => {
    notifyRef.current(friendlyError(error, fallback), 'error');
    // 23503: the person or meetup was deleted since this phone last did a full reload.
    // Reload everything now so it disappears instead of failing again.
    if ((error as { code?: string } | null)?.code === '23503') {
      lastFull.current = 0;
      void refreshRef.current();
    }
    return false;
  }, []);

  // Profiles are the only large dataset. Load them in pages once, then every poll fetches only
  // rows whose updated_at moved. A full reload every few minutes picks up deletions and blocks.
  const profileMap = useRef(new Map<string, Profile>());
  const lastSync = useRef<string | null>(null);
  const lastFull = useRef(0);

  const syncProfiles = useCallback(async (): Promise<{ list: Profile[] | null; error: unknown }> => {
    const full = lastSync.current === null || Date.now() - lastFull.current > FULL_SYNC_MS;
    let map: Map<string, Profile>;
    if (full) {
      map = new Map();
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = await supabase.from('profiles').select('*').order('id').range(from, from + PAGE_SIZE - 1);
        if (page.error) return { list: null, error: page.error };
        for (const row of page.data ?? []) map.set(row.id, row);
        if ((page.data ?? []).length < PAGE_SIZE) break;
      }
      lastFull.current = Date.now();
    } else {
      const changed = await supabase
        .from('profiles')
        .select('*')
        .gte('updated_at', lastSync.current!)
        .order('updated_at')
        .limit(PAGE_SIZE);
      if (changed.error) return { list: null, error: changed.error };
      const rows = changed.data ?? [];
      if (rows.length >= PAGE_SIZE) lastFull.current = 0; // Too many changes; do a full load next time.
      const fresh = rows.filter((r) => profileMap.current.get(r.id)?.updated_at !== r.updated_at);
      if (fresh.length === 0) return { list: null, error: null }; // Nothing changed: keep the current list.
      map = new Map(profileMap.current);
      for (const row of fresh) map.set(row.id, row);
    }
    profileMap.current = map;
    let newest = lastSync.current ?? '';
    for (const p of map.values()) if (p.updated_at > newest) newest = p.updated_at;
    lastSync.current = newest || null;
    const list = [...map.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    return { list, error: null };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const cutoff = new Date(Date.now() - MEETUP_GRACE_MS).toISOString();
      const [profiles, intros, meetups, blocks, unreadRes] = await Promise.all([
        syncProfiles(),
        supabase
          .from('intros')
          .select('*')
          .or(`from_id.eq.${userId},to_id.eq.${userId}`)
          .order('created_at', { ascending: false }),
        supabase.from('meetups').select('*').gte('when_at', cutoff).order('when_at', { ascending: true }),
        supabase.from('blocks').select('*').eq('blocker_id', userId),
        supabase.from('messages').select('sender_id').eq('recipient_id', userId).is('read_at', null).limit(1000),
      ]);
      const firstError = profiles.error ?? intros.error ?? meetups.error ?? blocks.error ?? unreadRes.error;
      if (firstError) {
        fail(firstError, "Couldn't load the latest data. Pull to refresh or try again.");
        return;
      }

      // Only ask for contacts that can be visible: your own and your connections'.
      const contactIds = new Set([userId]);
      for (const i of intros.data ?? []) if (i.status === 'accepted') contactIds.add(i.from_id === userId ? i.to_id : i.from_id);
      const meetupIds = (meetups.data ?? []).map((m) => m.id);
      const [contacts, joinsRes] = await Promise.all([
        supabase.from('contacts').select('*').in('user_id', [...contactIds]),
        meetupIds.length > 0 ? supabase.from('meetup_joins').select('*').in('meetup_id', meetupIds) : Promise.resolve(null),
      ]);
      const secondError = contacts.error ?? joinsRes?.error;
      if (secondError) {
        fail(secondError);
        return;
      }
      if (queued.current) return;
      setData((d) => ({
        profiles: profiles.list ?? d.profiles,
        intros: intros.data ?? [],
        contacts: new Map((contacts.data ?? []).map((c: Contact) => [c.user_id, c.contact])),
        meetups: meetups.data ?? [],
        joins: joinsRes?.data ?? [],
        blocks: blocks.data ?? [],
        unread: countBySender(unreadRes.data ?? []),
      }));
      setLoaded(true);
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void refreshRef.current();
      }
    }
  }, [fail, syncProfiles, userId]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Initial load, a poll every ~30s (jittered so a room full of phones doesn't hit the
  // server in lockstep), and a refresh when the tab becomes visible again.
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  useEffect(() => {
    setData(EMPTY);
    setLoaded(false);
    profileMap.current = new Map();
    lastSync.current = null;
    void refresh();
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && !pausedRef.current()) void refresh();
        schedule();
      }, REFRESH_MS + Math.random() * REFRESH_JITTER_MS);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !pausedRef.current()) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, refresh]);

  const saveProfile = useCallback(
    async (draft: ProfileDraft): Promise<boolean> => {
      const row = {
        id: userId,
        name: draft.name.trim(),
        program: orNull(draft.program),
        cohort: orNull(draft.cohort),
        research_topic: orNull(draft.research_topic),
        bio: orNull(draft.bio),
        tags: draft.tags,
        open_to: draft.open_to,
        avatar_path: draft.avatar_path,
        prompt: draft.prompt_answer.trim() ? draft.prompt : null,
        prompt_answer: orNull(draft.prompt_answer),
        this_or_that: draft.this_or_that,
      };
      const previousPhoto = data.profiles.find((p) => p.id === userId)?.avatar_path ?? null;
      const { data: saved, error } = await supabase.from('profiles').upsert(row).select().single();
      if (error) return fail(error);

      const contact = draft.contact.trim();
      const contactResult = contact
        ? await supabase.from('contacts').upsert({ user_id: userId, contact })
        : await supabase.from('contacts').delete().eq('user_id', userId);
      if (contactResult.error) return fail(contactResult.error);
      // Best effort: remove the old photo once the new one is saved.
      if (previousPhoto && previousPhoto !== row.avatar_path) void supabase.storage.from(AVATAR_BUCKET).remove([previousPhoto]);

      // Update local state right away so the badge reflects the change immediately.
      setData((d) => {
        const contacts = new Map(d.contacts);
        if (contact) contacts.set(userId, contact);
        else contacts.delete(userId);
        const exists = d.profiles.some((p) => p.id === userId);
        const profiles = exists ? d.profiles.map((p) => (p.id === userId ? saved : p)) : [saved, ...d.profiles];
        return { ...d, profiles, contacts };
      });
      return true;
    },
    [userId, fail, data.profiles],
  );

  /** Uploads a resized photo and returns its storage path; the profile save records it. */
  const uploadPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const blob = await squarePhoto(file);
        const path = `${userId}/${Date.now().toString(36)}.jpg`;
        const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
          contentType: 'image/jpeg',
          // Each upload gets a new file name, so phones can cache photos for a year.
          cacheControl: '31536000',
        });
        if (error) {
          fail(error, "Your photo didn't upload. Try again.");
          return null;
        }
        return path;
      } catch (error) {
        fail(error);
        return null;
      }
    },
    [userId, fail],
  );

  const block = useCallback(
    async (otherId: string): Promise<boolean> => {
      const { error } = await supabase.from('blocks').insert({ blocker_id: userId, blocked_id: otherId });
      if (error && error.code !== '23505') return fail(error);
      setData((d) => ({ ...d, blocks: [...d.blocks, { blocker_id: userId, blocked_id: otherId, created_at: new Date().toISOString() }] }));
      void refresh();
      return true;
    },
    [userId, fail, refresh],
  );

  const unblock = useCallback(
    async (otherId: string): Promise<boolean> => {
      const { error } = await supabase.from('blocks').delete().match({ blocker_id: userId, blocked_id: otherId });
      if (error) return fail(error);
      setData((d) => ({ ...d, blocks: d.blocks.filter((b) => b.blocked_id !== otherId) }));
      void refresh();
      return true;
    },
    [userId, fail, refresh],
  );

  const report = useCallback(
    async (otherId: string, reason: string): Promise<boolean> => {
      const { error } = await supabase.from('reports').insert({ reporter_id: userId, reported_id: otherId, reason: reason.trim() });
      if (error) return fail(error);
      return true;
    },
    [userId, fail],
  );

  const sendIntro = useCallback(
    async (toId: string, message: string): Promise<boolean> => {
      const { data: intro, error } = await supabase
        .from('intros')
        .insert({ from_id: userId, to_id: toId, message: message.trim() })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') void refresh();
        return fail(error);
      }
      setData((d) => ({ ...d, intros: [intro, ...d.intros] }));
      return true;
    },
    [userId, fail, refresh],
  );

  const respondIntro = useCallback(
    async (introId: string, status: Exclude<IntroStatus, 'pending'>, reply: string): Promise<boolean> => {
      const { error } = await supabase.from('intros').update({ status, reply: orNull(reply) }).eq('id', introId);
      if (error) return fail(error);
      setData((d) => ({
        ...d,
        intros: d.intros.map((i) => (i.id === introId ? { ...i, status, reply: orNull(reply) } : i)),
      }));
      // Accepting unlocks the other person's contact, which only a fresh read returns.
      await refresh();
      return true;
    },
    [fail, refresh],
  );

  const postMeetup = useCallback(
    async (draft: MeetupDraft): Promise<boolean> => {
      const { data: meetup, error } = await supabase
        .from('meetups')
        .insert({
          host_id: userId,
          title: draft.title.trim(),
          place: draft.place.trim(),
          when_at: draft.when_at,
          details: orNull(draft.details),
        })
        .select()
        .single();
      if (error) return fail(error);
      const join = await supabase.from('meetup_joins').insert({ meetup_id: meetup.id, user_id: userId });
      if (join.error) fail(join.error, 'Your meetup is posted, but we could not add you to it.');
      await refresh();
      return true;
    },
    [userId, fail, refresh],
  );

  const joinMeetup = useCallback(
    async (meetupId: string): Promise<boolean> => {
      const { error } = await supabase.from('meetup_joins').insert({ meetup_id: meetupId, user_id: userId });
      if (error && error.code !== '23505') return fail(error);
      setData((d) => ({ ...d, joins: [...d.joins, { meetup_id: meetupId, user_id: userId }] }));
      void refresh();
      return true;
    },
    [userId, fail, refresh],
  );

  const leaveMeetup = useCallback(
    async (meetupId: string): Promise<boolean> => {
      const { error } = await supabase.from('meetup_joins').delete().match({ meetup_id: meetupId, user_id: userId });
      if (error) return fail(error);
      setData((d) => ({ ...d, joins: d.joins.filter((j) => !(j.meetup_id === meetupId && j.user_id === userId)) }));
      void refresh();
      return true;
    },
    [userId, fail, refresh],
  );

  const deleteMeetup = useCallback(
    async (meetupId: string): Promise<boolean> => {
      const { error } = await supabase.from('meetups').delete().eq('id', meetupId);
      if (error) return fail(error);
      setData((d) => ({
        ...d,
        meetups: d.meetups.filter((m) => m.id !== meetupId),
        joins: d.joins.filter((j) => j.meetup_id !== meetupId),
      }));
      return true;
    },
    [fail],
  );

  /** Called by an open chat after it marks messages read, so badges clear right away. */
  const clearUnread = useCallback((senderId: string) => {
    setData((d) => {
      if (!d.unread.has(senderId)) return d;
      const unread = new Map(d.unread);
      unread.delete(senderId);
      return { ...d, unread };
    });
  }, []);

  return {
    ...data,
    loaded,
    clearUnread,
    refresh,
    saveProfile,
    uploadPhoto,
    block,
    unblock,
    report,
    sendIntro,
    respondIntro,
    postMeetup,
    joinMeetup,
    leaveMeetup,
    deleteMeetup,
  };
}

export type DataApi = ReturnType<typeof useData>;
