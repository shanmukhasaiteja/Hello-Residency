import type { Profile } from '../lib/types';
import { bandColor, tagColor } from '../lib/match';
import { Avatar } from './Avatar';

type TagProfile = Pick<Profile, 'name' | 'program' | 'cohort' | 'research_topic' | 'tags'> &
  Partial<Pick<Profile, 'avatar_path' | 'prompt' | 'prompt_answer'>>;

interface NameTagProps {
  profile: TagProfile;
  size?: 'full' | 'card' | 'mini';
  /** Tags to highlight as shared with the viewer. */
  highlight?: string[];
}

const AVATAR_SIZE = { full: 72, card: 52, mini: 30 } as const;

/** The conference name tag: lanyard slot, colored band, "Hello, I'm", photo and the name. */
export function NameTag({ profile, size = 'card', highlight = [] }: NameTagProps) {
  const { bg, fg, gradient } = bandColor(profile);
  const shared = new Set(highlight);
  const meta = [profile.program, profile.cohort].filter(Boolean).join(' · ');
  const tags = size === 'card' ? profile.tags.slice(0, 4) : profile.tags;
  const avatarProfile = { ...profile, avatar_path: profile.avatar_path ?? null };

  return (
    <div className={`nametag nametag-${size}`} style={{ ['--band' as string]: bg }}>
      <div className="nametag-band" style={{ background: gradient, color: fg }}>
        <span className="nametag-slot" aria-hidden="true" />
        <span className="nametag-hello">Hello, I'm</span>
      </div>
      {size === 'mini' && (
        <span className="nametag-mini-avatar">
          <Avatar profile={avatarProfile} size={AVATAR_SIZE.mini} />
        </span>
      )}
      <div className="nametag-body">
        <div className="nametag-head">
          {size !== 'mini' && <Avatar profile={avatarProfile} size={AVATAR_SIZE[size]} />}
          <div className="nametag-id">
            <p className="nametag-name">{profile.name || 'Your name'}</p>
            {meta && <p className="nametag-meta">{meta}</p>}
          </div>
        </div>
        {size !== 'mini' && profile.research_topic && <p className="nametag-topic">{profile.research_topic}</p>}
        {size !== 'mini' && profile.prompt && profile.prompt_answer && (
          <p className="nametag-prompt">
            <span className="nametag-prompt-q">{profile.prompt}</span> {profile.prompt_answer}
          </p>
        )}
        {size !== 'mini' && tags.length > 0 && (
          <ul className="tag-list" aria-label="Interests">
            {tags.map((t) => (
              <li
                key={t}
                className={shared.has(t) ? 'tag tag-shared' : 'tag'}
                style={shared.has(t) ? undefined : { background: tagColor(t).bg, color: tagColor(t).fg }}
              >
                {shared.has(t) && (
                  <>
                    <span aria-hidden="true">✓ </span>
                    <span className="sr-only">Shared: </span>
                  </>
                )}
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
