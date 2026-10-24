import { useState, type FormEvent } from 'react';
import type { Meetup, MeetupDraft, MeetupJoin, Profile } from '../lib/types';
import { firstName } from '../lib/match';

const MAX_NAMES = 5;

interface MeetupsProps {
  me: Profile;
  profiles: Profile[];
  meetups: Meetup[];
  joins: MeetupJoin[];
  onPost: (draft: MeetupDraft) => Promise<boolean>;
  onJoin: (id: string) => Promise<boolean>;
  onLeave: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  notify: (message: string, kind?: 'ok' | 'error') => void;
}

const whenFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const MEETUP_ACCENTS = ['#0B7A7C', '#9A47C2', '#D6336C', '#3B6FE0', '#C25E00'];

/** Value for a datetime-local input, in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function Meetups({ me, profiles, meetups, joins, onPost, onJoin, onLeave, onDelete, notify }: MeetupsProps) {
  const [posting, setPosting] = useState(false);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  const upcoming = meetups.filter((m) => new Date(m.when_at).getTime() >= cutoff);

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">Upcoming meetups</h2>
        {!posting && (
          <button type="button" className="btn btn-primary" onClick={() => setPosting(true)}>
            Post meetup
          </button>
        )}
      </div>

      {posting && (
        <MeetupForm
          onCancel={() => setPosting(false)}
          onSubmit={async (draft) => {
            const ok = await onPost(draft);
            if (ok) {
              setPosting(false);
              notify('Meetup posted. You are on the list.');
            }
            return ok;
          }}
        />
      )}

      {upcoming.length === 0 && !posting ? (
        <div className="empty">
          <h2>No meetups yet</h2>
          <p>Start one. Coffee after the morning session counts.</p>
        </div>
      ) : (
        <ul className="meetup-list">
          {upcoming.map((m) => {
            const going = joins.filter((j) => j.meetup_id === m.id).map((j) => byId.get(j.user_id)).filter((p): p is Profile => !!p);
            const imGoing = joins.some((j) => j.meetup_id === m.id && j.user_id === me.id);
            const isHost = m.host_id === me.id;
            const host = byId.get(m.host_id);
            const started = new Date(m.when_at).getTime() < Date.now();
            const names = going.slice(0, MAX_NAMES).map((p) => (p.id === me.id ? 'You' : firstName(p.name)));
            const extra = going.length - names.length;
            return (
              <li
                key={m.id}
                className="card meetup"
                style={{ ['--accent' as string]: MEETUP_ACCENTS[m.id.charCodeAt(0) % MEETUP_ACCENTS.length] }}
              >
                <div className="meetup-top">
                  <div className="date-badge" aria-hidden="true">
                    <span className="date-month">{monthFormat.format(new Date(m.when_at))}</span>
                    <span className="date-day">{dayFormat.format(new Date(m.when_at))}</span>
                  </div>
                  <div className="meetup-when">
                    {started && <span className="pill">Happening now</span>}
                    <time dateTime={m.when_at} title={whenFormat.format(new Date(m.when_at))}>
                      {timeFormat.format(new Date(m.when_at))}
                    </time>
                  </div>
                </div>
                <h3 className="meetup-title">{m.title}</h3>
                <p className="meetup-place">
                  <span aria-hidden="true">📍</span> {m.place}
                </p>
                {m.details && <p className="meetup-details">{m.details}</p>}
                <p className="meetup-meta">
                  Hosted by {isHost ? 'you' : host?.name ?? 'someone'} · {going.length} going
                  {names.length > 0 && (
                    <>
                      <br />
                      <span className="muted">
                        {names.join(', ')}
                        {extra > 0 && ` and ${extra} more`}
                      </span>
                    </>
                  )}
                </p>
                <div className="btn-row">
                  {isHost && (
                    <button
                      type="button"
                      className="btn btn-danger-ghost"
                      onClick={async () => {
                        if (window.confirm(`Delete "${m.title}"? People who joined will no longer see it.`)) {
                          if (await onDelete(m.id)) notify('Meetup deleted.');
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {imGoing ? (
                    !isHost && (
                      <button type="button" className="btn btn-ghost" onClick={() => onLeave(m.id)}>
                        Leave
                      </button>
                    )
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => onJoin(m.id)}>
                      Join
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MeetupForm({ onSubmit, onCancel }: { onSubmit: (d: MeetupDraft) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const date = new Date(when);
    if (!title.trim() || !place.trim()) return setError('Add a title and a place so people can find you.');
    if (Number.isNaN(date.getTime())) return setError('Pick a date and time.');
    if (date.getTime() < Date.now() - 5 * 60 * 1000) return setError('That time has already passed. Pick a time in the future.');
    setBusy(true);
    await onSubmit({ title, place, when_at: date.toISOString(), details });
    setBusy(false);
  }

  return (
    <form className="card meetup-form" onSubmit={submit} noValidate>
      <label className="field">
        <span>Title</span>
        <input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Coffee before the keynote" />
      </label>
      <label className="field">
        <span>Place</span>
        <input value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder="Main hall café" />
      </label>
      <label className="field">
        <span>Date and time</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="field">
        <span>Details (optional)</span>
        <textarea rows={2} maxLength={400} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Posting…' : 'Post meetup'}
        </button>
      </div>
    </form>
  );
}
