// Turns Supabase and network errors into plain-language messages that say how to fix things.

interface ErrorLike {
  message?: string;
  code?: string;
}

export function friendlyError(error: unknown, fallback = 'Something went wrong. Try again in a moment.'): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const message = e.message ?? (typeof error === 'string' ? error : '');
  const lower = message.toLowerCase();

  if (e.code === '23505') return 'You already said hi to this person. Check your Inbox for their reply.';
  if (e.code === '42501' || lower.includes('row-level security')) return "You don't have permission to do that. Sign in again and retry.";
  if (e.code === '23514' || lower.includes('violates check constraint')) return 'One of the fields is empty or too long. Shorten it and try again.';
  if (lower.includes('invalid login credentials')) return "That email and password don't match. Check them and try again.";
  if (lower.includes('already registered') || lower.includes('already been registered')) return 'An account with this email already exists. Sign in instead.';
  if (lower.includes('password should be at least') || lower.includes('password is too short')) return 'Use a password with at least 6 characters.';
  if (lower.includes('weak password')) return 'That password is too easy to guess. Try a longer one.';
  if (lower.includes('email not confirmed')) return 'This email is not confirmed yet. Ask the organizer to turn off "Confirm email" in Supabase, or check your inbox.';
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) return 'That email address looks off. Check it and try again.';
  if (lower.includes('rate limit') || e.code === 'over_email_send_rate_limit') return 'Too many attempts right now. Wait a minute and try again.';
  if (lower.includes('failed to fetch') || lower.includes('network')) return "Can't reach the server. Check your connection and try again.";
  if (lower.includes('jwt') && lower.includes('expired')) return 'Your session expired. Sign in again.';
  return message || fallback;
}
