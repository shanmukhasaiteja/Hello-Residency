import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { openedFromRecoveryLink, supabase } from '../lib/supabase';

/**
 * Current auth session (`undefined` while the stored session is still loading), plus whether
 * the user arrived from a password reset link and still needs to choose a new password.
 */
export function useSession(): { session: Session | null | undefined; recovering: boolean; doneRecovering: () => void } {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(openedFromRecoveryLink);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const doneRecovering = useCallback(() => setRecovering(false), []);
  return { session, recovering, doneRecovering };
}
