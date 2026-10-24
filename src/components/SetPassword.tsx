import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

const MIN_LENGTH = 6;

/** Shown after someone opens a password reset link: they're signed in and pick a new password. */
export function SetPassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Use a password with at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match. Type them again.");
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(friendlyError(updateError));
    else onDone();
  }

  return (
    <main className="auth-wrap">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h2>Choose a new password</h2>
        <p className="muted">For {email}. You'll stay signed in on this device.</p>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-autofocus
            autoFocus
          />
          <small className="hint">At least {MIN_LENGTH} characters.</small>
        </label>
        <label className="field">
          <span>Type it again</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </main>
  );
}
