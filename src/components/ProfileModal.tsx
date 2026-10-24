import { useState, type FormEvent } from 'react';
import type { Intro, Profile, Relation } from '../lib/types';
import { defaultMessage, sharedTags } from '../lib/match';
import { Modal } from './Modal';
import { NameTag } from './NameTag';
import { ContactLine } from './ContactLine';

const MESSAGE_MAX = 500;

interface ProfileModalProps {
  me: Profile;
  person: Profile;
  relation: Relation;
  /** The pending intro this person sent to me, if any. */
  incoming: Intro | undefined;
  contact: string | undefined;
  onSendIntro: (toId: string, message: string) => Promise<boolean>;
  onRespond: (introId: string, status: 'accepted' | 'declined', reply: string) => Promise<boolean>;
  onClose: () => void;
}

export function ProfileModal({ me, person, relation, incoming, contact, onSendIntro, onRespond, onClose }: ProfileModalProps) {
  const shared = sharedTags(me, person);
  const [message, setMessage] = useState(() => defaultMessage(me, person));
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    await onSendIntro(person.id, message);
    setBusy(false);
  }

  async function respond(status: 'accepted' | 'declined') {
    if (!incoming) return;
    setBusy(true);
    await onRespond(incoming.id, status, reply);
    setBusy(false);
  }

  return (
    <Modal title={person.name} onClose={onClose} hideTitle>
      <NameTag profile={person} size="full" highlight={shared} />
      <div className="profile-details">
        {shared.length > 0 && (
          <p className="shared-note">
            You both like <strong>{shared.join(', ')}</strong>.
          </p>
        )}
        {person.bio && <p className="bio">{person.bio}</p>}
        {person.open_to.length > 0 && (
          <div>
            <h3 className="mini-heading">Open to</h3>
            <ul className="chip-row" aria-label="Open to">
              {person.open_to.map((o) => (
                <li key={o} className={me.open_to.includes(o) ? 'chip chip-static chip-on' : 'chip chip-static'}>
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="modal-action">
        {relation === 'none' && (
          <form onSubmit={send}>
            <label className="field">
              <span>Your message</span>
              <textarea
                data-autofocus
                rows={4}
                maxLength={MESSAGE_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <small className="hint">
                {message.length}/{MESSAGE_MAX}. They'll see your name tag with this message.
              </small>
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !message.trim()}>
              {busy ? 'Sending…' : 'Say hi'}
            </button>
          </form>
        )}
        {relation === 'sent' && (
          <p className="status-note">Hi sent. If they say hi back, their contact details will show up here and in your Inbox.</p>
        )}
        {relation === 'incoming' && incoming && (
          <div>
            <p className="status-note">{person.name.split(' ')[0]} wants to say hi:</p>
            <blockquote className="message">{incoming.message}</blockquote>
            <label className="field">
              <span>Reply (optional)</span>
              <textarea rows={2} maxLength={MESSAGE_MAX} value={reply} onChange={(e) => setReply(e.target.value)} />
            </label>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => respond('declined')}>
                Not now
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => respond('accepted')}>
                Accept
              </button>
            </div>
          </div>
        )}
        {relation === 'connected' && (
          <div>
            <p className="status-note status-ok">You're connected.</p>
            <ContactLine contact={contact} />
          </div>
        )}
      </div>
    </Modal>
  );
}
