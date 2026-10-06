import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sends an account request. Visitors can only add a request; nobody can read requests
 * through the app. The owner reviews them in Supabase (Table Editor → account_requests).
 */
export function RequestAccount({ client, onClose }: { client: SupabaseClient; onClose(): void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // hidden trap field; people never see or fill it
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (website) return setState('sent'); // a bot filled the hidden field: pretend it worked
    setState('sending');
    setError('');
    const { error } = await client
      .from('account_requests')
      .insert({ name: name.trim(), email: email.trim(), message: message.trim() });
    if (error) {
      setState('idle');
      setError(error.message.includes('Too many') ? error.message : "Couldn't send the request. Please try again later.");
    } else {
      setState('sent');
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card narrow-modal" role="dialog" aria-modal="true" aria-label="Request an account">
        <h2>Request an account</h2>
        {state === 'sent' ? (
          <>
            <p>Thanks! Your request was sent. If it's approved, you'll get your sign-in details directly from the owner.</p>
            <div className="form-actions"><button className="primary" onClick={onClose}>Close</button></div>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted small">
              An account saves your entries online so you can use them on any device. This is a personal app, so accounts are approved by hand.
              Your entries are private to your account.
            </p>
            <div className="form-grid two">
              <label><span>Name</span><input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
              <label><span>Email</span><input required type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
              <label className="f-notes"><span>Anything you'd like to add (optional)</span>
                <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <label className="trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="primary" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send request'}</button>
              <button className="ghost" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
