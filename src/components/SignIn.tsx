import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const redirectTo = () => window.location.origin + window.location.pathname;

export function SignIn({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  async function github() {
    const { error } = await client.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: redirectTo() } });
    if (error) setMsg(error.message);
  }

  async function magicLink(e: FormEvent) {
    e.preventDefault();
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: false } });
    setMsg(error ? error.message : 'Check your email for a sign-in link.');
  }

  return (
    <div className="signin">
      <div className="card signin-card">
        <img src="./icon.svg" alt="" width={48} height={48} />
        <h1>Time Tracker</h1>
        <p className="muted">Sign in to see your time log.</p>
        <button className="primary wide" onClick={github}>Continue with GitHub</button>
        <div className="or">or</div>
        <form onSubmit={magicLink} className="stack-sm">
          <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button className="ghost wide" type="submit">Email me a sign-in link</button>
        </form>
        {msg && <p className="notice" role="status">{msg}</p>}
      </div>
    </div>
  );
}
