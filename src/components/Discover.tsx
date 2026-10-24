import { useDeferredValue, useMemo, useState } from 'react';
import { OPEN_TO_OPTIONS, type Intro, type Profile, type Relation } from '../lib/types';
import { matchesQuery, matchOfTheDay, matchReason, popularTags, relation, searchText, sharedTags, suggestions } from '../lib/match';
import { NameTag } from './NameTag';

const STATUS_LABEL: Record<Relation, string> = {
  none: 'Say hi',
  sent: 'Hi sent',
  incoming: 'Wants to say hi',
  connected: 'Connected',
};

interface DiscoverProps {
  me: Profile;
  profiles: Profile[];
  intros: Intro[];
  onOpen: (person: Profile) => void;
}

export function Discover({ me, profiles, intros, onOpen }: DiscoverProps) {
  const [query, setQuery] = useState('');
  const [openTo, setOpenTo] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim());

  const others = useMemo(() => profiles.filter((p) => p.id !== me.id), [profiles, me.id]);
  const indexed = useMemo(() => others.map((p) => ({ p, text: searchText(p) })), [others]);
  const tags = useMemo(() => popularTags(profiles), [profiles]);
  const relations = useMemo(() => {
    const map = new Map<string, Relation>();
    for (const p of others) map.set(p.id, relation(me.id, p.id, intros));
    return map;
  }, [others, intros, me.id]);

  const filtering = deferredQuery !== '' || openTo !== null || tag !== null;
  const today = new Date().toDateString();
  const match = useMemo(() => (filtering ? null : matchOfTheDay(me, others, intros, new Date(today))), [filtering, me, others, intros, today]);
  const likeYou = useMemo(
    () => (filtering ? [] : suggestions(me, others, intros).filter((p) => p.id !== match?.id)),
    [filtering, me, others, intros, match],
  );

  const results = useMemo(
    () =>
      indexed
        .filter(
          ({ p, text }) =>
            (!deferredQuery || matchesQuery(text, deferredQuery)) &&
            (!openTo || p.open_to.includes(openTo)) &&
            (!tag || p.tags.includes(tag)),
        )
        .map(({ p }) => p),
    [indexed, deferredQuery, openTo, tag],
  );

  if (others.length === 0) {
    return (
      <section className="empty">
        <h2>You are the first one here</h2>
        <p>Share the link so others can join.</p>
        <CopyLinkButton />
      </section>
    );
  }

  const card = (p: Profile) => {
    const rel = relations.get(p.id) ?? 'none';
    return (
      <li key={p.id}>
        <button type="button" className="person-card" onClick={() => onOpen(p)} aria-label={`${p.name}, ${STATUS_LABEL[rel]}`}>
          <NameTag profile={p} size="card" highlight={sharedTags(me, p)} />
          <span className={`status status-${rel}`}>{STATUS_LABEL[rel]}</span>
        </button>
      </li>
    );
  };

  return (
    <section>
      <div className="search">
        <label className="sr-only" htmlFor="search">
          Search people
        </label>
        <input
          id="search"
          type="search"
          placeholder="Search names, programs, topics, tags"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="filters">
        <div className="chip-row" role="group" aria-label="Filter by open to">
          {OPEN_TO_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              className={openTo === o ? 'chip chip-on' : 'chip'}
              aria-pressed={openTo === o}
              onClick={() => setOpenTo(openTo === o ? null : o)}
            >
              {o}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="chip-row" role="group" aria-label="Filter by popular tag">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className={tag === t ? 'chip chip-tag chip-on' : 'chip chip-tag'}
                aria-pressed={tag === t}
                onClick={() => setTag(tag === t ? null : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {match && (
        <div className="motd">
          <div className="motd-text">
            <p className="motd-label">Your match of the day</p>
            <h2 className="motd-name">{match.name}</h2>
            <p className="motd-reason">{matchReason(me, match)}</p>
            <button type="button" className="btn btn-primary" onClick={() => onOpen(match)}>
              Say hi to {match.name.split(' ')[0]}
            </button>
            <p className="motd-foot">A new match every day.</p>
          </div>
          <button type="button" className="motd-tag" onClick={() => onOpen(match)} aria-label={`Open ${match.name}'s name tag`}>
            <NameTag profile={match} size="card" highlight={sharedTags(me, match)} />
          </button>
        </div>
      )}

      {likeYou.length > 0 && (
        <>
          <h2 className="section-title">People like you</h2>
          <ul className="grid">{likeYou.map(card)}</ul>
        </>
      )}

      <h2 className="section-title">
        {filtering ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : `Everyone (${others.length})`}
      </h2>
      {results.length > 0 ? (
        <ul className="grid">{results.map(card)}</ul>
      ) : (
        <div className="empty empty-inline">
          <p>No one matches that yet. Try a shorter search or clear the filters.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQuery('');
              setOpenTo(null);
              setTag(null);
            }}
          >
            Clear search and filters
          </button>
        </div>
      )}
    </section>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.origin);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  );
}
