import { useEffect, useRef, useState } from 'react';
import { download, entriesToCsv, entryKey, parseEntriesJson } from '../lib/files';
import { localStore, type Store } from '../lib/store';
import { compareEntries, isoDate } from '../lib/time';
import type { Entry, Settings } from '../lib/types';

interface Props {
  store: Store;
  userEmail: string | undefined;
  entries: Entry[];
  settings: Settings;
  onSaveSettings(s: Settings): void;
  onImport(entries: Entry[]): Promise<void>;
  onSignOut?(): void;
}

export function SettingsView({ store, userEmail, entries, settings, onSaveSettings, onImport, onSignOut }: Props) {
  const [hours, setHours] = useState(String(settings.dailyHours));
  const [lunch, setLunch] = useState(String(settings.lunchAllowanceMin));
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    if (store.kind === 'cloud') localStore.list().then((l) => setLocalCount(l.length));
  }, [store]);

  function saveSettings() {
    const h = Number(hours), l = Number(lunch);
    if (!(h > 0 && h <= 24) || !(l >= 0 && l <= 240)) return setMsg('Enter hours between 0 and 24 and lunch minutes between 0 and 240.');
    onSaveSettings({ dailyHours: h, lunchAllowanceMin: l });
    setMsg('Settings saved.');
  }

  /** Adds entries that aren't already in the log (same id, or same date + start + project). */
  async function importNew(incoming: Entry[], source: string) {
    const ids = new Set(entries.map((e) => e.id));
    const keys = new Set(entries.map(entryKey));
    const fresh = incoming.filter((e) => !ids.has(e.id) && !keys.has(entryKey(e)));
    if (fresh.length === 0) return setMsg(`Nothing new in ${source}: all ${incoming.length} entries are already in your log.`);
    if (!window.confirm(`Add ${fresh.length} new entries from ${source}? (${incoming.length - fresh.length} already exist and will be skipped.)`)) return;
    await onImport(fresh);
    setMsg(`Imported ${fresh.length} entries.`);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    try {
      await importNew(parseEntriesJson(await file.text()), file.name);
    } catch (err) {
      setMsg(`Couldn't import: ${(err as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const sorted = [...entries].sort(compareEntries);

  return (
    <div className="stack narrow">
      {msg && <p className="notice" role="status">{msg}</p>}

      <section className="card">
        <h2>Workday</h2>
        <div className="form-grid two">
          <label><span>Daily hours target</span><input type="number" min="0" max="24" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
          <label><span>Lunch minutes counted as work</span><input type="number" min="0" max="240" step="5" value={lunch} onChange={(e) => setLunch(e.target.value)} /></label>
        </div>
        <p className="muted small">Lunch longer than this is subtracted from time worked (the workbook used 30).</p>
        <div className="form-actions"><button className="primary" onClick={saveSettings}>Save</button></div>
      </section>

      <section className="card">
        <h2>Where your data lives</h2>
        {store.kind === 'cloud' ? (
          <>
            <p>Saved to your Supabase database, signed in as <strong>{userEmail}</strong>. Available on any device you sign in from.</p>
            {localCount > 0 && (
              <p>
                This browser also has {localCount} entries saved from before you connected the cloud.{' '}
                <button className="ghost sm" onClick={async () => importNew(await localStore.list(), 'this browser')}>Copy them to the cloud</button>
              </p>
            )}
            <div className="form-actions"><button className="ghost" onClick={onSignOut}>Sign out</button></div>
          </>
        ) : (
          <p>
            <strong>This device only.</strong> Entries are saved in this browser. Clearing browser data erases them, so export a backup now and then.
            Connect Supabase (see the README) to sync across devices.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Import & backup</h2>
        <p className="muted small">Import a JSON file made by <code>tools/excel_to_json.py</code> from your workbook, or a backup exported below. Entries already in your log are skipped, so importing the same file twice is safe.</p>
        <div className="form-actions">
          <button className="primary" onClick={() => fileRef.current?.click()}>Import JSON…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          <button className="ghost" onClick={() => download(`time-log-backup_${isoDate()}.json`, JSON.stringify({ exported: new Date().toISOString(), settings, entries: sorted }, null, 2), 'application/json')}>Export backup (JSON)</button>
          <button className="ghost" onClick={() => download(`time-log_${isoDate()}.csv`, entriesToCsv(sorted), 'text/csv')}>Export all (CSV)</button>
        </div>
        <p className="muted small">{entries.length} entries in your log.</p>
      </section>
    </div>
  );
}
