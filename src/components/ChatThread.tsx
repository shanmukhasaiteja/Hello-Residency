import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Intro, Profile } from '../lib/types';
import { useChat } from '../hooks/useChat';
import type { Notify } from '../hooks/useData';
import { Modal } from './Modal';
import { NameTag } from './NameTag';

const MAX = 1000;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

interface ChatThreadProps {
  me: Profile;
  person: Profile;
  /** The accepted intro that connected you; shown as the start of the conversation. */
  intro: Intro | undefined;
  notify: Notify;
  onRead: () => void;
  onOpenProfile: () => void;
  onClose: () => void;
}

export function ChatThread({ me, person, intro, notify, onRead, onOpenProfile, onClose }: ChatThreadProps) {
  const { messages, loaded, sending, send } = useChat(me.id, person.id, { notify, onRead });
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Keep the newest message in view unless the user scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, loaded]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || sending) return;
    stickToBottom.current = true;
    if (await send(draft)) setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a keyboard; Shift+Enter adds a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover)').matches) {
      e.preventDefault();
      void submit();
    }
  }

  let lastDay = '';
  const firstName = person.name.split(' ')[0];

  return (
    <Modal title={`Chat with ${person.name}`} onClose={onClose} hideTitle className="chat-modal">
      <button type="button" className="chat-head" onClick={onOpenProfile} aria-label={`Open ${person.name}'s name tag`}>
        <NameTag profile={person} size="mini" />
      </button>

      <div className="chat-list" ref={listRef} aria-live="polite" aria-label="Messages">
        {intro && (
          <div className="chat-start">
            <p className="chat-start-label">You connected with a hi</p>
            <p>
              <strong>{intro.from_id === me.id ? 'You' : firstName}:</strong> {intro.message}
            </p>
            {intro.reply && (
              <p>
                <strong>{intro.to_id === me.id ? 'You' : firstName}:</strong> {intro.reply}
              </p>
            )}
          </div>
        )}
        {!loaded && <p className="muted chat-empty">Loading messages…</p>}
        {loaded && messages.length === 0 && <p className="muted chat-empty">Say hello to {firstName}. Only the two of you can see this chat.</p>}
        {messages.map((m) => {
          const day = dayFormat.format(new Date(m.created_at));
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} className="chat-row-wrap">
              {showDay && <p className="chat-day">{day}</p>}
              <div className={mine ? 'chat-row chat-mine' : 'chat-row'}>
                <p className="chat-bubble">
                  <span className="sr-only">{mine ? 'You' : firstName}: </span>
                  {m.body}
                </p>
                <span className="chat-time">
                  {timeFormat.format(new Date(m.created_at))}
                  {mine && m.read_at && ' · Seen'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form className="chat-compose" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">
          Message {firstName}
        </label>
        <textarea
          id="chat-input"
          data-autofocus
          rows={1}
          maxLength={MAX}
          value={draft}
          placeholder={`Message ${firstName}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </Modal>
  );
}
