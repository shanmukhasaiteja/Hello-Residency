import type { Profile } from '../lib/types';
import { bandColor } from '../lib/match';

type TagProfile = Pick<Profile, 'name' | 'program' | 'cohort' | 'research_topic' | 'tags'>;

interface NameTagProps {
  profile: TagProfile;
  size?: 'full' | 'card' | 'mini';
  /** Tags to highlight as shared with the viewer. */
  highlight?: string[];
}

/** The conference name tag: lanyard slot, colored band, "Hello, I'm" and the name. */
export function NameTag({ profile, size = 'card', highlight = [] }: NameTagProps) {
  const { bg, fg } = bandColor(profile);
  const shared = new Set(highlight);
  const meta = [profile.program, profile.cohort].filter(Boolean).join(' · ');
  const tags = size === 'card' ? profile.tags.slice(0, 4) : profile.tags;

  return (
    <div className={`nametag nametag-${size}`}>
      <div className="nametag-band" style={{ background: bg, color: fg }}>
        <span className="nametag-slot" aria-hidden="true" />
        <span className="nametag-hello">Hello, I'm</span>
      </div>
      <div className="nametag-body">
        <p className="nametag-name">{profile.name || 'Your name'}</p>
        {meta && <p className="nametag-meta">{meta}</p>}
        {size !== 'mini' && profile.research_topic && <p className="nametag-topic">{profile.research_topic}</p>}
        {size !== 'mini' && tags.length > 0 && (
          <ul className="tag-list" aria-label="Interests">
            {tags.map((t) => (
              <li key={t} className={shared.has(t) ? 'tag tag-shared' : 'tag'}>
                {shared.has(t) && <span className="sr-only">Shared: </span>}
                {t}
              </li>
            ))}
            {size === 'card' && profile.tags.length > tags.length && (
              <li className="tag tag-more">+{profile.tags.length - tags.length}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
