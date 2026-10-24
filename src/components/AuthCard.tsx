import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

export function AuthCard() {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
        <h2>{signup ? 'Create your account' : 'Welcome back'}</h2>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
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
        </label>
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
          {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
        </button>
        <p className="auth-switch">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(signup ? 'signin' : 'signup');
              setError(null);
              setInfo(null);
            }}
          >
            {signup ? 'Sign in' : 'Create an account'}
          </button>
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
