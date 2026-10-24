import { avatarUrl } from '../lib/supabase';
import { bandColor } from '../lib/match';
import type { Profile } from '../lib/types';

type AvatarProfile = Pick<Profile, 'name' | 'program' | 'cohort' | 'avatar_path'>;

/** Round profile photo, or initials on the badge color when there is no photo. */
export function Avatar({ profile, size }: { profile: AvatarProfile; size: number }) {
  const url = avatarUrl(profile.avatar_path);
  const style = { width: size, height: size };
  if (url) return <img className="avatar" src={url} alt="" width={size} height={size} style={style} loading="lazy" />;
  const { bg, fg } = bandColor(profile);
  const initials = profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: bg, color: fg, fontSize: size * 0.38 }} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}
