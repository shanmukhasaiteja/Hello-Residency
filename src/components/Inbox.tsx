import { useState } from 'react';
import type { Intro, Profile } from '../lib/types';
import { relation } from '../lib/match';
import { NameTag } from './NameTag';
import { ContactLine } from './ContactLine';

interface InboxProps {
  me: Profile;
  profiles: Profile[];
  intros: Intro[];
  contacts: Map<string, string>;
  onRespond: (introId: string, status: 'accepted' | 'declined', reply: string) => Promise<boolean>;
  onOpen: (person: Profile) => void;
  onDiscover: () => void;
}

export function Inbox({ me, profiles, intros, contacts, onRespond, onOpen, onDiscover }: InboxProps) {
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const waitingForYou = intros.filter((i) => i.to_id === me.id && i.status === 'pending' && byId.has(i.from_id));

  // One entry per connected person, using the accepted intro between you.
  const connections: { person: Profile; intro: Intro }[] = [];
  const seen = new Set<string>();
  for (const i of intros) {
    if (i.status !== 'accepted') continue;
    const otherId = i.from_id === me.id ? i.to_id : i.from_id;
    const person = byId.get(otherId);
    if (!person || seen.has(otherId)) continue;
    seen.add(otherId);
    connections.push({ person, intro: i });
  }

  // Declined intros still show here, so the sender never gets a rejection notice.
  const waitingOnThem = intros.filter(
    (i) => i.from_id === me.id && byId.has(i.to_id) && relation(me.id, i.to_id, intros) === 'sent',
  );

  if (waitingForYou.length + connections.length + waitingOnThem.length === 0) {
    return (
      <section className="empty">
        <h2>Your inbox is empty</h2>
        <p>Find someone with a shared interest and say hi. Their reply will show up here.</p>
        <button type="button" className="btn btn-primary" onClick={onDiscover}>
          Find people
        </button>
      </section>
    );
  }

  return (
    <section className="inbox">
      <h2 className="section-title">Waiting for your reply {waitingForYou.length > 0 && <span className="count">{waitingForYou.length}</span>}</h2>
      {waitingForYou.length === 0 ? (
        <p className="muted">Nothing waiting on you right now.</p>
      ) : (
        <ul className="inbox-list">
          {waitingForYou.map((i) => (
            <IncomingItem key={i.id} intro={i} person={byId.get(i.from_id)!} onRespond={onRespond} onOpen={onOpen} />
          ))}
        </ul>
      )}

      <h2 className="section-title">Connections</h2>
      {connections.length === 0 ? (
        <p className="muted">When someone accepts your hi, or you accept theirs, they'll appear here with their contact.</p>
      ) : (
        <ul className="inbox-list">
          {connections.map(({ person, intro }) => (
            <li key={person.id} className="card inbox-item">
              <button type="button" className="inbox-person" onClick={() => onOpen(person)}>
                <NameTag profile={person} size="mini" />
              </button>
              <div className="inbox-body">
                <p className="inbox-line">
                  <span className="muted">{intro.from_id === me.id ? 'You said:' : 'They said:'}</span> {intro.message}
                </p>
                {intro.reply && (
                  <p className="inbox-line">
                    <span className="muted">{intro.to_id === me.id ? 'You replied:' : 'They replied:'}</span> {intro.reply}
                  </p>
                )}
                <ContactLine contact={contacts.get(person.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">Waiting on them</h2>
      {waitingOnThem.length === 0 ? (
        <p className="muted">No hi's out right now.</p>
      ) : (
        <ul className="inbox-list">
          {waitingOnThem.map((i) => {
            const person = byId.get(i.to_id)!;
            return (
              <li key={i.id} className="card inbox-item">
                <button type="button" className="inbox-person" onClick={() => onOpen(person)}>
                  <NameTag profile={person} size="mini" />
                </button>
                <div className="inbox-body">
                  <p className="inbox-line">
                    <span className="muted">You said:</span> {i.message}
                  </p>
                  <p className="status-note">Hi sent</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface IncomingItemProps {
  intro: Intro;
  person: Profile;
  onRespond: InboxProps['onRespond'];
  onOpen: (person: Profile) => void;
}

function IncomingItem({ intro, person, onRespond, onOpen }: IncomingItemProps) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function respond(status: 'accepted' | 'declined') {
    setBusy(true);
    await onRespond(intro.id, status, reply);
    setBusy(false);
  }

  return (
    <li className="card inbox-item">
      <button type="button" className="inbox-person" onClick={() => onOpen(person)}>
        <NameTag profile={person} size="mini" />
      </button>
      <div className="inbox-body">
        <blockquote className="message">{intro.message}</blockquote>
        <label className="field">
          <span>Reply (optional)</span>
          <textarea rows={2} maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} />
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
    </li>
  );
}
