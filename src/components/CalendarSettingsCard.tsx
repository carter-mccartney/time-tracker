import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { removeCalendarSettings, saveCalendarSettings } from '../lib/calendarCloud';
import type { CalendarSync } from '../lib/useCalendarSync';

interface Props {
  client: SupabaseClient;
  userId: string;
  calendar: CalendarSync;
}

export function CalendarSettingsCard({ client, userId, calendar }: Props) {
  const current = calendar.settings;
  const [url, setUrl] = useState(current?.icsUrl ?? '');
  const [titleTarget, setTitleTarget] = useState<'notes' | 'project'>(current?.titleTarget ?? 'notes');
  const [entryType, setEntryType] = useState(current?.entryType ?? 'Meeting');
  const [showUrl, setShowUrl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!current) return;
    setUrl(current.icsUrl);
    setTitleTarget(current.titleTarget);
    setEntryType(current.entryType);
  }, [current]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (!/^(https|webcal):\/\//i.test(link)) return setMsg('Paste the full link, starting with https:// (or webcal://).');
    if (/\.html?(\?|$)/i.test(link)) return setMsg('That looks like the HTML link. Use the ICS link (it ends in .ics).');
    setBusy(true);
    try {
      await saveCalendarSettings(client, userId, { icsUrl: link, titleTarget, entryType });
      await calendar.reloadSettings();
      setMsg('Saved. Your calendar will sync now and every 10 minutes while the app is open.');
    } catch (err) {
      setMsg(`Couldn't save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Stop syncing your calendar? Entries already added stay in your log.')) return;
    setBusy(true);
    try {
      await removeCalendarSettings(client, userId);
      await calendar.reloadSettings();
      setUrl('');
      setMsg('Calendar sync turned off.');
    } catch (err) {
      setMsg(`Couldn't remove: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Calendar sync (Teams / Outlook)</h2>
      <p className="muted small">
        Adds today's meetings to your log automatically, once each, before they end. Past meetings are never added automatically,
        and nothing is changed after an entry is created.
      </p>
      <details className="cal-howto">
        <summary>How to get your calendar link</summary>
        <ol className="small">
          <li>Open Outlook on the web (outlook.office.com) → <strong>Settings</strong> (gear) → <strong>Calendar</strong> → <strong>Shared calendars</strong>.</li>
          <li>Under <strong>Publish a calendar</strong>, pick <strong>Calendar</strong> and <strong>Can view titles and locations</strong>, then <strong>Publish</strong>.</li>
          <li>Copy the <strong>ICS</strong> link (not the HTML one) and paste it below.</li>
        </ol>
        <p className="small muted">
          Anyone who has this link can see your meeting titles, so keep it private. If it ever leaks, use <strong>Reset links</strong> on the same Outlook page.
          If you don't see "Publish a calendar", your organization has turned it off.
        </p>
      </details>
      <form onSubmit={save} className="stack-sm">
        <div className="with-btn">
          <input type={showUrl ? 'text' : 'password'} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" aria-label="Calendar ICS link" autoComplete="off" />
          <button type="button" className="ghost sm" onClick={() => setShowUrl(!showUrl)}>{showUrl ? 'Hide' : 'Show'}</button>
        </div>
        <div className="form-grid two">
          <label><span>Meeting title goes into</span>
            <select value={titleTarget} onChange={(e) => setTitleTarget(e.target.value as 'notes' | 'project')}>
              <option value="notes">Notes (you pick the project later)</option>
              <option value="project">Project</option>
            </select>
          </label>
          <label><span>Type for meeting entries</span>
            <input list="dl-types" value={entryType} maxLength={60} onChange={(e) => setEntryType(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary" type="submit" disabled={busy}>{current ? 'Save changes' : 'Turn on calendar sync'}</button>
          {current && <button type="button" className="ghost danger" onClick={remove} disabled={busy}>Turn off</button>}
        </div>
      </form>
      {msg && <p className="notice" role="status">{msg}</p>}
      {current && calendar.error && <p className="form-error" role="alert">Last sync: {calendar.error}</p>}
    </section>
  );
}
