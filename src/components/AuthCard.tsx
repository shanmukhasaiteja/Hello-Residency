import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

export function AuthCard() {
  const [mode, setMode] = useState<'signup' | 'signin' | 'forgot'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: typeof mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function sendReset() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email you signed up with.');
      return;
    }
    setBusy(true);
    try {
      // The link comes back to this site, where the app asks for a new password.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (resetError) setError(friendlyError(resetError));
      else setInfo("If there's an account for that email, a reset link is on its way. It can take a minute; check spam too.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === 'forgot') {
      await sendReset();
      return;
    }
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      const creds = { email: email.trim(), password };
      const { data, error: authError } =
        mode === 'signup' ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
      if (authError) setError(friendlyError(authError));
      else if (mode === 'signup' && !data.session)
        setInfo('Account created. Check your email to confirm it, then sign in. (Organizers: turn off "Confirm email" in Supabase to skip this.)');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === 'signup';
  const forgot = mode === 'forgot';
  return (
    <main className="auth-wrap">
      <div className="auth-intro">
        <div className="hero-tags" aria-hidden="true">
          <HeroTag name="Priya" topic="Coral reefs" band="linear-gradient(120deg, #0B7A7C, #0E8F7E)" tilt={-8} />
          <HeroTag name="Jonas" topic="Quantum codes" band="linear-gradient(120deg, #9A47C2, #D6336C)" tilt={5} />
          <HeroTag name="Amara" topic="Sleep & memory" band="linear-gradient(120deg, #F4B63F, #F7894A)" dark tilt={-3} />
        </div>
        <h1>
          Hello <span className="gradient-text">Residency</span>
        </h1>
        <p className="lead">Find the people you came here to meet. Make a name tag, see who shares your interests, and say hi.</p>
        <ul className="hero-points">
          <li>
            <span aria-hidden="true">✨</span> Smart matches
          </li>
          <li>
            <span aria-hidden="true">📍</span> Who's nearby
          </li>
          <li>
            <span aria-hidden="true">☕</span> Casual meetups
          </li>
        </ul>
      </div>
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h2>{forgot ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back'}</h2>
        {forgot && <p className="muted">Enter the email you signed up with and we'll send you a link to choose a new password.</p>}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {!forgot && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signup && <small className="hint">At least 6 characters.</small>}
            {mode === 'signin' && (
              <button type="button" className="link-btn forgot-link" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            )}
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="form-ok" role="status">
            {info}
          </p>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'One moment…' : forgot ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}
        </button>
        <p className="auth-switch">
          {forgot ? (
            <>
              Remembered it?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
                Back to sign in
              </button>
            </>
          ) : (
            <>
              {signup ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" className="link-btn" onClick={() => switchMode(signup ? 'signin' : 'signup')}>
                {signup ? 'Sign in' : 'Create an account'}
              </button>
            </>
          )}
        </p>
        <p className="privacy-note">
          Your name tag is visible to everyone signed in to this residency. Your contact details stay private until you
          accept someone's hi, or they accept yours.
        </p>
      </form>
    </main>
  );
}

function HeroTag({ name, topic, band, tilt, dark }: { name: string; topic: string; band: string; tilt: number; dark?: boolean }) {
  return (
    <div className="hero-tag" style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="hero-tag-band" style={{ background: band, color: dark ? '#15233B' : '#fff' }}>
        <span className="nametag-slot" />
        Hello, I'm
      </div>
      <div className="hero-tag-body">
        <strong>{name}</strong>
        <span>{topic}</span>
      </div>
    </div>
  );
}
