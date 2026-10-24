import { useState, type FormEvent } from 'react';
import type { CheckinVisibility, Intro, Profile } from '../lib/types';
import { distanceLabel, relation, sharedTags, timeAgo } from '../lib/match';
import { CHECKIN_TTL_MS, isLive, type NearbyApi } from '../hooks/useNearby';
import { NameTag } from './NameTag';

const SPOT_MAX = 60;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

interface NearbyProps {
  me: Profile;
  profiles: Profile[];
  intros: Intro[];
  nearby: NearbyApi;
  onOpen: (person: Profile) => void;
}

export function Nearby({ me, profiles, intros, nearby, onOpen }: NearbyProps) {
  const { mine, people, loaded, busy, checkIn, checkOut, refresh } = nearby;
  const live = isLive(mine);
  const [spot, setSpot] = useState(mine?.spot ?? '');
  const [useLocation, setUseLocation] = useState(true);
  const [visibility, setVisibility] = useState<CheckinVisibility>(mine?.visibility ?? 'everyone');
  const [editing, setEditing] = useState(false);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await checkIn(spot, useLocation, visibility)) setEditing(false);
  }

  if (!loaded) {
    return (
      <section className="loading loading-inline" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
      </section>
    );
  }

  const form = (
    <form className="card checkin-form" onSubmit={submit}>
      <label className="field">
        <span>Where are you?</span>
        <input
          value={spot}
          maxLength={SPOT_MAX}
          onChange={(e) => setSpot(e.target.value)}
          placeholder="Library café, 2nd floor"
          autoComplete="off"
        />
      </label>
      <fieldset className="field visibility-choice">
        <legend>Who can see me</legend>
        <label className={visibility === 'everyone' ? 'vis-option vis-on' : 'vis-option'}>
          <input type="radio" name="visibility" checked={visibility === 'everyone'} onChange={() => setVisibility('everyone')} />
          <span>
            <strong>
              <span aria-hidden="true">🌍</span> Everyone nearby
            </strong>
            <small>Meet new people. You'll see everyone else who's open too.</small>
          </span>
        </label>
        <label className={visibility === 'connections' ? 'vis-option vis-on' : 'vis-option'}>
          <input type="radio" name="visibility" checked={visibility === 'connections'} onChange={() => setVisibility('connections')} />
          <span>
            <strong>
              <span aria-hidden="true">🤝</span> Only my connections
            </strong>
            <small>Only people you've connected with see you, and you only see them.</small>
          </span>
        </label>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={useLocation} onChange={(e) => setUseLocation(e.target.checked)} />
        <span>Share my rough distance (never my exact location)</span>
      </label>
      <div className="form-actions">
        {editing && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || (!useLocation && !spot.trim())}>
          {busy ? (useLocation ? 'Finding you…' : 'Checking in…') : live ? 'Update check-in' : 'Check in'}
        </button>
      </div>
    </form>
  );

  if (!live) {
    return (
      <section className="nearby">
        <div className="nearby-intro">
          <span className="pulse" aria-hidden="true" />
          <h2>See who's around right now</h2>
          <p className="muted">
            Check in to show up for others nearby for the next 2 hours. You'll see who else is checked in. People only see a rough
            distance (like "about 150 m away"), never your exact location, and you can check out any time.
          </p>
        </div>
        {form}
      </section>
    );
  }

  const until = new Date(new Date(mine.updated_at).getTime() + CHECKIN_TTL_MS);
  const visible = people.filter((n) => byId.has(n.user_id));

  return (
    <section className="nearby">
      <div className="card checkin-status">
        <div>
          <p className="checkin-live">
            <span className="pulse pulse-sm" aria-hidden="true" /> You're checked in
          </p>
          <p className="muted checkin-meta">
            {mine.spot ? `${mine.spot} · ` : ''}
            {mine.visibility === 'connections' ? 'Connections only' : 'Visible to everyone nearby'} ·{' '}
            {mine.lat !== null ? 'rough distance' : 'place only'} · until {timeFormat.format(until)}
          </p>
        </div>
        {!editing && (
          <div className="btn-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              Update
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void checkOut()}>
              Check out
            </button>
          </div>
        )}
      </div>
      {editing && form}

      <div className="section-head">
        <h2 className="section-title">
          {visible.length === 0
            ? mine.visibility === 'connections'
              ? 'None of your connections are checked in'
              : 'Nobody else is checked in yet'
            : `${visible.length} ${visible.length === 1 ? 'person' : 'people'} around`}
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="muted">
          {mine.visibility === 'connections'
            ? "When people you've connected with check in, they'll show up here. Switch to Everyone nearby to meet someone new."
            : "When others check in within about 5 km, they'll show up here. Tell a friend to check in, or post a meetup so people know where to find you."}
        </p>
      ) : (
        <ul className="nearby-list">
          {visible.map((n) => {
            const person = byId.get(n.user_id)!;
            const rel = relation(me.id, person.id, intros);
            const distance = distanceLabel(n.distance_m);
            const shared = sharedTags(me, person);
            return (
              <li key={n.user_id}>
                <button type="button" className="card nearby-item" onClick={() => onOpen(person)}>
                  <NameTag profile={person} size="mini" highlight={shared} />
                  <span className="nearby-info">
                    {distance && <span className="nearby-distance">{distance}</span>}
                    {n.spot && <span className="nearby-spot">At {n.spot}</span>}
                    <span className="muted nearby-when">
                      Checked in {timeAgo(n.checked_in_at)}
                      {shared.length > 0 && ` · You both like ${shared[0]}`}
                    </span>
                  </span>
                  <span className={`status-chip status-${rel}`}>
                    {rel === 'none' ? 'Say hi' : rel === 'sent' ? 'Hi sent' : rel === 'incoming' ? 'Wants to say hi' : 'Connected'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
