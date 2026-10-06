import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RequestAccount } from './RequestAccount';
import { githubLoginEnabled, setRememberDevice } from '../lib/supabase';

const redirectTo = () => window.location.origin + window.location.pathname;

export function SignIn({ client, onTryDemo }: { client: SupabaseClient; onTryDemo(): void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [requesting, setRequesting] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setRememberDevice(remember);
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  }

  async function forgotPassword() {
    if (!email.trim()) return setMsg('Enter your email above first.');
    setRememberDevice(remember);
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
    setMsg(error ? error.message : 'If that email has an account, a link to set a new password is on its way. Open it on this device.');
  }

  async function github() {
    setRememberDevice(remember);
    const { error } = await client.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: redirectTo() } });
    if (error) setMsg(error.message);
  }

  return (
    <div className="signin">
      <div className="card signin-card">
        <img src="./icon.svg" alt="" width={48} height={48} />
        <h1>Time Tracker</h1>
        <p className="muted">Sign in to see your time log.</p>
        <form onSubmit={signIn} className="stack-sm">
          <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <input type="password" required autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this device
          </label>
          <button className="primary wide" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted small signin-hint">
          {remember ? "You'll stay signed in here until you sign out." : "You'll be signed out when you close this browser. Use this on shared computers."}
        </p>
        <button className="link" type="button" onClick={forgotPassword}>Forgot password?</button>
        {githubLoginEnabled && <button className="ghost wide" onClick={github}>Continue with GitHub</button>}
        {msg && <p className="notice" role="status">{msg}</p>}

        <div className="or">New here?</div>
        <button className="ghost wide" onClick={onTryDemo}>Try it without an account</button>
        <p className="muted small signin-hint">Demo entries stay in this browser only.</p>
        <button className="link" type="button" onClick={() => setRequesting(true)}>Request an account</button>
      </div>
      {requesting && <RequestAccount client={client} onClose={() => setRequesting(false)} />}
    </div>
  );
}
