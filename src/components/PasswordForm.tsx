import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const MIN_LENGTH = 10;

/** New password + confirm. Used in Settings and after opening an invite or reset-password link. */
export function PasswordForm({ client, submitLabel, onDone }: { client: SupabaseClient; submitLabel: string; onDone?(): void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setMsg({ ok: false, text: `Use at least ${MIN_LENGTH} characters.` });
    if (password !== confirm) return setMsg({ ok: false, text: "The passwords don't match." });
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setPassword('');
    setConfirm('');
    setMsg({ ok: true, text: 'Password updated.' });
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="stack-sm">
      <input type="password" autoComplete="new-password" placeholder={`New password (${MIN_LENGTH}+ characters)`} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" required />
      <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm new password" required />
      {msg && <p className={msg.ok ? 'notice' : 'form-error'} role="status">{msg.text}</p>}
      <div><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div>
    </form>
  );
}

/** Full-page step shown after an invite or reset link signs someone in. */
export function SetPasswordPage({ client, invite, onDone }: { client: SupabaseClient; invite: boolean; onDone(): void }) {
  return (
    <div className="signin">
      <div className="card signin-card">
        <img src="./icon.svg" alt="" width={48} height={48} />
        <h1>{invite ? 'Welcome! Choose a password' : 'Choose a new password'}</h1>
        <p className="muted">You'll use this with your email to sign in on any device.</p>
        <PasswordForm client={client} submitLabel="Save password and continue" onDone={onDone} />
      </div>
    </div>
  );
}
