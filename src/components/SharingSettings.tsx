import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadDisplayName, removeShare, saveDisplayName, shareLabel, shareLog, updateShare,
  type Permission, type Share,
} from '../lib/sharing';

interface Props {
  client: SupabaseClient;
  userId: string;
  shares: Share[];
  /** Re-reads the share list after any change (also refreshes the log switcher). */
  onChanged(): Promise<void>;
  onOpenLog(share: Share): void;
}

const PERMISSION_TEXT: Record<Permission, string> = {
  view: 'Can view',
  edit: 'Can add & edit (not delete)',
};

export function SharingSettings({ client, userId, shares, onChanged, onOpenLog }: Props) {
  const [name, setName] = useState('');
  const [nameSaved, setNameSaved] = useState('');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<Permission>('view');
  const [hideNotes, setHideNotes] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDisplayName(client, userId).then((n) => { setName(n); setNameSaved(n); }).catch(() => {});
  }, [client, userId]);

  const outgoing = shares.filter((s) => s.direction === 'out');
  const incoming = shares.filter((s) => s.direction === 'in');

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      setMsg(success);
    } catch (err) {
      setMsg(`Couldn't save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function share(e: FormEvent) {
    e.preventDefault();
    const target = email.trim();
    await run(() => shareLog(client, target, permission, hideNotes),
      `Done. If ${target} has an account here, they can now open your log from the switcher at the top of their screen.`);
    setEmail('');
  }

  return (
    <>
      <section className="card">
        <h2>Your name</h2>
        <p className="muted small">Shown to people you share your log with, instead of your email.</p>
        <div className="with-btn">
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Carter" aria-label="Display name" />
          <button className="primary" disabled={busy || name.trim() === nameSaved}
            onClick={() => run(async () => { await saveDisplayName(client, userId, name); setNameSaved(name.trim()); }, 'Name saved.')}>
            Save
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Share your log</h2>
        <p className="muted small">
          Let another account holder see your dashboard, log and reports. They switch to your log from the top of their screen.
          They need an account here first. For privacy, the app won't say whether an email has one.
        </p>
        <form onSubmit={share} className="share-form">
          <input type="email" required placeholder="Their email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to share with" />
          <select value={permission} onChange={(e) => setPermission(e.target.value as Permission)} aria-label="Permission">
            <option value="view">{PERMISSION_TEXT.view}</option>
            <option value="edit">{PERMISSION_TEXT.edit}</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={permission === 'view' && hideNotes} disabled={permission === 'edit'} onChange={(e) => setHideNotes(e.target.checked)} />
            Hide my notes
          </label>
          <button className="primary" type="submit" disabled={busy}>Share</button>
        </form>
        {permission === 'edit' && <p className="muted small">Editors always see notes, since they may be filling them in.</p>}
        {msg && <p className="notice" role="status">{msg}</p>}

        {outgoing.length > 0 && (
          <table className="table">
            <thead><tr><th>Shared with</th><th>Access</th><th>Notes</th><th /></tr></thead>
            <tbody>
              {outgoing.map((s) => (
                <tr key={s.id}>
                  <td>{shareLabel(s)}{s.otherName && <div className="muted small">{s.otherEmail}</div>}</td>
                  <td>
                    <select value={s.permission} disabled={busy} aria-label={`Access for ${shareLabel(s)}`}
                      onChange={(e) => run(() => updateShare(client, s.id, e.target.value as Permission, s.hideNotes), 'Access updated.')}>
                      <option value="view">{PERMISSION_TEXT.view}</option>
                      <option value="edit">{PERMISSION_TEXT.edit}</option>
                    </select>
                  </td>
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={s.hideNotes} disabled={busy || s.permission === 'edit'}
                        onChange={(e) => run(() => updateShare(client, s.id, s.permission, e.target.checked), 'Access updated.')} />
                      Hidden
                    </label>
                  </td>
                  <td>
                    <button className="ghost sm danger" disabled={busy}
                      onClick={() => window.confirm(`Stop sharing your log with ${shareLabel(s)}?`) && run(() => removeShare(client, s.id), 'Sharing stopped.')}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="card">
          <h2>Logs shared with you</h2>
          <table className="table">
            <tbody>
              {incoming.map((s) => (
                <tr key={s.id}>
                  <td>{shareLabel(s)}<div className="muted small">{PERMISSION_TEXT[s.permission]}{s.hideNotes ? ' · notes hidden' : ''}</div></td>
                  <td className="num nowrap">
                    <button className="ghost sm" onClick={() => onOpenLog(s)}>Open</button>{' '}
                    <button className="ghost sm danger" disabled={busy}
                      onClick={() => window.confirm(`Remove ${shareLabel(s)}'s log from your list? They'd need to share it again.`) && run(() => removeShare(client, s.id), 'Removed.')}>
                      Leave
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
