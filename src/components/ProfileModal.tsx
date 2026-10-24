import { useState, type FormEvent } from 'react';
import { THIS_OR_THAT, type Intro, type Profile, type Relation } from '../lib/types';
import { OPEN_TO_EMOJI, agreements, defaultMessage, sharedTags } from '../lib/match';
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
  onBlock: (personId: string) => Promise<boolean>;
  onMessage: () => void;
  onReport: (personId: string, reason: string, alsoBlock: boolean) => Promise<boolean>;
  onClose: () => void;
}

export function ProfileModal({
  me,
  person,
  relation,
  incoming,
  contact,
  onSendIntro,
  onRespond,
  onBlock,
  onMessage,
  onReport,
  onClose,
}: ProfileModalProps) {
  const shared = sharedTags(me, person);
  const agree = new Set(agreements(me, person));
  const theirPicks = THIS_OR_THAT.map((pair) => pair.find((o) => person.this_or_that.includes(o))).filter(
    (o): o is NonNullable<typeof o> => !!o,
  );
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
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

  async function sendReport(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    const ok = await onReport(person.id, reason, alsoBlock);
    setBusy(false);
    if (ok) setReporting(false);
  }

  async function block() {
    if (!window.confirm(`Block ${person.name}? You won't see each other anywhere in the app, and they won't be told.`)) return;
    setBusy(true);
    await onBlock(person.id);
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
        {theirPicks.length > 0 && (
          <div>
            <h3 className="mini-heading">
              This or that
              {me.this_or_that.length > 0 && <span className="tot-score"> · you agree on {agree.size}</span>}
            </h3>
            <ul className="chip-row" aria-label="This or that">
              {theirPicks.map((o) => (
                <li key={o} className={agree.has(o) ? 'chip chip-static chip-on' : 'chip chip-static'}>
                  {agree.has(o) && <span className="sr-only">You agree: </span>}
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        {person.open_to.length > 0 && (
          <div>
            <h3 className="mini-heading">Open to</h3>
            <ul className="chip-row" aria-label="Open to">
              {person.open_to.map((o) => (
                <li key={o} className={me.open_to.includes(o) ? 'chip chip-static chip-on' : 'chip chip-static'}>
                  <span aria-hidden="true">{OPEN_TO_EMOJI[o]}</span> {o}
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
            <button type="button" className="btn btn-primary btn-block chat-open" onClick={onMessage}>
              <span aria-hidden="true">💬</span> Message {person.name.split(' ')[0]}
            </button>
          </div>
        )}
      </div>

      <div className="safety">
        {reporting ? (
          <form onSubmit={sendReport} className="report-form">
            <label className="field">
              <span>What happened?</span>
              <textarea
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Only the organizers see reports."
              />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
              <span>Also block {person.name.split(' ')[0]}</span>
            </label>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReporting(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger-ghost btn-sm" disabled={busy || !reason.trim()}>
                Send report
              </button>
            </div>
          </form>
        ) : (
          <>
            <button type="button" className="link-btn link-muted" disabled={busy} onClick={block}>
              Block
            </button>
            <button type="button" className="link-btn link-muted" onClick={() => setReporting(true)}>
              Report
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
