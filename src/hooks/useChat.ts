// One open conversation. Polls every few seconds while open (cheap: only rows newer than the
// last one), instead of a realtime socket, so 1000+ people stay within Supabase's connection limits.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import type { Message } from '../lib/types';
import type { Notify } from './useData';

const POLL_MS = 3_000;
const HISTORY = 200;

export function useChat(meId: string, otherId: string, { notify, onRead }: { notify: Notify; onRead: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const last = useRef<string | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const pair = `and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`;

  const markRead = useCallback(async () => {
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', meId)
      .eq('sender_id', otherId)
      .is('read_at', null);
    if (!error) onReadRef.current();
  }, [meId, otherId]);

  // Only polled rows move the "last seen" marker. A just-sent message must not, or a message
  // the other person sent a moment earlier (not yet polled) would be skipped.
  const merge = useCallback((rows: Message[], fromPoll: boolean) => {
    if (rows.length === 0) return;
    if (fromPoll) {
      const newest = rows.reduce((max, r) => (r.created_at > max ? r.created_at : max), last.current ?? '');
      last.current = newest || last.current;
    }
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const next = [...cur, ...rows.filter((r) => !seen.has(r.id))];
      next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
      return next;
    });
  }, []);

  // "Seen" for my messages: only while some of them are still unread, ask which have been read.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const refreshSeen = useCallback(async () => {
    const unseen = messagesRef.current.filter((m) => m.sender_id === meId && !m.read_at);
    if (unseen.length === 0) return;
    const { data } = await supabase
      .from('messages')
      .select('id, read_at')
      .eq('sender_id', meId)
      .eq('recipient_id', otherId)
      .gte('created_at', unseen[0].created_at)
      .not('read_at', 'is', null);
    if (!data || data.length === 0) return;
    const readAt = new Map(data.map((r) => [r.id, r.read_at]));
    setMessages((cur) => cur.map((m) => (readAt.has(m.id) && !m.read_at ? { ...m, read_at: readAt.get(m.id) ?? null } : m)));
  }, [meId, otherId]);

  const poll = useCallback(async () => {
    const query = supabase.from('messages').select('*').or(pair);
    const res = last.current
      ? await query.gt('created_at', last.current).order('created_at', { ascending: true }).limit(HISTORY)
      : await query.order('created_at', { ascending: false }).limit(HISTORY);
    if (res.error) {
      notifyRef.current(friendlyError(res.error, "Couldn't load messages. Check your connection."), 'error');
      return;
    }
    const rows = res.data ?? [];
    merge(rows, true);
    setLoaded(true);
    await refreshSeen();
    if (rows.some((m) => m.recipient_id === meId && !m.read_at)) void markRead();
  }, [pair, merge, markRead, meId, refreshSeen]);

  useEffect(() => {
    setMessages([]);
    setLoaded(false);
    last.current = null;
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text) return false;
      setSending(true);
      const { data, error } = await supabase.from('messages').insert({ sender_id: meId, recipient_id: otherId, body: text }).select().single();
      setSending(false);
      if (error) {
        const message =
          error.code === '42501'
            ? 'You can only message people you are connected with.'
            : friendlyError(error, "Your message didn't send. Try again.");
        notifyRef.current(message, 'error');
        return false;
      }
      merge([data], false);
      return true;
    },
    [meId, otherId, merge],
  );

  return { messages, loaded, sending, send };
}
