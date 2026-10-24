// The app's data layer: loads everything the signed-in user can see and wraps every write.
// All privacy is enforced by Row Level Security; this hook only reads what RLS returns.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import type { Contact, Intro, IntroStatus, Meetup, MeetupDraft, MeetupJoin, Profile, ProfileDraft } from '../lib/types';

const REFRESH_MS = 30_000;
/** Meetups that started more than this long ago are hidden. */
const MEETUP_GRACE_MS = 3 * 60 * 60 * 1000;

export type Notify = (message: string, kind?: 'ok' | 'error') => void;

export interface AppData {
  profiles: Profile[];
  intros: Intro[];
  contacts: Map<string, string>;
  meetups: Meetup[];
  joins: MeetupJoin[];
}

const EMPTY: AppData = { profiles: [], intros: [], contacts: new Map(), meetups: [], joins: [] };

interface Options {
  notify: Notify;
  /** Polling skips a refresh while this returns true (typing, modal open). */
  isPaused: () => boolean;
}

function orNull(value: string): string | null {
  const v = value.trim();
  return v === '' ? null : v;
}

export function useData(userId: string, { notify, isPaused }: Options) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const inFlight = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const fail = useCallback((error: unknown, fallback?: string) => {
    notifyRef.current(friendlyError(error, fallback), 'error');
    return false;
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const cutoff = new Date(Date.now() - MEETUP_GRACE_MS).toISOString();
      const [profiles, intros, contacts, meetups] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('intros').select('*').order('created_at', { ascending: false }),
        supabase.from('contacts').select('*'),
        supabase.from('meetups').select('*').gte('when_at', cutoff).order('when_at', { ascending: true }),
      ]);
      const firstError = profiles.error ?? intros.error ?? contacts.error ?? meetups.error;
      if (firstError) {
        fail(firstError, "Couldn't load the latest data. Pull to refresh or try again.");
        return;
      }
      const meetupIds = (meetups.data ?? []).map((m) => m.id);
      let joins: MeetupJoin[] = [];
      if (meetupIds.length > 0) {
        const res = await supabase.from('meetup_joins').select('*').in('meetup_id', meetupIds);
        if (res.error) {
          fail(res.error);
          return;
        }
        joins = res.data ?? [];
      }
      setData({
        profiles: profiles.data ?? [],
        intros: intros.data ?? [],
        contacts: new Map((contacts.data ?? []).map((c: Contact) => [c.user_id, c.contact])),
        meetups: meetups.data ?? [],
        joins,
      });
      setLoaded(true);
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
    }
  }, [fail]);

  // Initial load, a 30s poll, and a refresh when the tab becomes visible again.
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  useEffect(() => {
    setData(EMPTY);
    setLoaded(false);
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !pausedRef.current()) void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !pausedRef.current()) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
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
      };
      const { data: saved, error } = await supabase.from('profiles').upsert(row).select().single();
      if (error) return fail(error);

      const contact = draft.contact.trim();
      const contactResult = contact
        ? await supabase.from('contacts').upsert({ user_id: userId, contact })
        : await supabase.from('contacts').delete().eq('user_id', userId);
      if (contactResult.error) return fail(contactResult.error);

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

  return {
    ...data,
    loaded,
    refresh,
    saveProfile,
    sendIntro,
    respondIntro,
    postMeetup,
    joinMeetup,
    leaveMeetup,
    deleteMeetup,
  };
}

export type DataApi = ReturnType<typeof useData>;
