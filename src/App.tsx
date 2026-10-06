import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { EntryForm } from './components/EntryForm';
import { Lists } from './components/Lists';
import { Log } from './components/Log';
import { Reports } from './components/Reports';
import { SettingsView } from './components/SettingsView';
import { SetPasswordPage } from './components/PasswordForm';
import { RequestAccount } from './components/RequestAccount';
import { SignIn } from './components/SignIn';
import { Today } from './components/Today';
import { makeSampleEntries } from './lib/sample';
import { clearLocalEntries, cloudStore, localStore, type Store } from './lib/store';
import { initialAuthLinkType, setRememberDevice, supabase } from './lib/supabase';
import { clockTime, compareEntries, isoDate, toSeconds } from './lib/time';
import { DEFAULT_SETTINGS, type Entry, type Settings } from './lib/types';

type Tab = 'today' | 'log' | 'reports' | 'lists' | 'settings';
const TABS: [Tab, string][] = [['today', 'Today'], ['log', 'Log'], ['reports', 'Reports'], ['lists', 'Projects & Types'], ['settings', 'Settings']];

const DEMO_KEY = 'tt.demo';

function readDemoFlag() {
  try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
}

function setDemoFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_KEY, '1');
    else localStorage.removeItem(DEMO_KEY);
  } catch { /* ignore */ }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [demo, setDemo] = useState(readDemoFlag);
  // Set when an invite or reset-password link signed someone in: they choose a password first.
  const [linkType, setLinkType] = useState(initialAuthLinkType);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setLinkType('recovery');
      if (event === 'SIGNED_IN') { setDemoFlag(false); setDemo(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const store = useMemo(() => (supabase && userId ? cloudStore(supabase, userId) : localStore), [userId]);

  if (!authReady) return <div className="splash">Loading…</div>;
  if (supabase && session && (linkType === 'invite' || linkType === 'recovery')) {
    return <SetPasswordPage client={supabase} invite={linkType === 'invite'} onDone={() => setLinkType(null)} />;
  }
  if (supabase && !session && !demo) {
    return <SignIn client={supabase} onTryDemo={() => { setDemoFlag(true); setDemo(true); }} />;
  }
  return (
    <Tracker
      key={userId ?? 'local'}
      store={store}
      userEmail={session?.user.email}
      demo={!!supabase && !session}
      onLeaveDemo={() => { setDemoFlag(false); setDemo(false); }}
    />
  );
}

/** Re-renders every `ms` so running timers and "time left" stay current. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Unique non-empty values, alphabetical — the workbook's SORT(UNIQUE(FILTER(...))). */
function uniqueSorted(values: string[]) {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = v.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function readTab(): Tab {
  try {
    const t = localStorage.getItem('tt.tab') as Tab | null;
    return t && TABS.some(([k]) => k === t) ? t : 'today';
  } catch {
    return 'today';
  }
}

interface TrackerProps {
  store: Store;
  userEmail: string | undefined;
  /** Visitor trying the app without an account: browser-only data, with a banner saying so. */
  demo: boolean;
  onLeaveDemo(): void;
}

function Tracker({ store, userEmail, demo, onLeaveDemo }: TrackerProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTabState] = useState<Tab>(readTab);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [requesting, setRequesting] = useState(false);

  const setTab = (t: Tab) => {
    setTabState(t);
    try { localStorage.setItem('tt.tab', t); } catch { /* ignore */ }
  };

  const reload = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([store.list(), store.loadSettings()]);
      setEntries(list.sort(compareEntries));
      setSettings(s);
      setError('');
    } catch (err) {
      setError(`Couldn't load your entries: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { reload(); }, [reload]);

  const running = useMemo(() => entries.filter((e) => e.end === null).at(-1), [entries]);
  const now = useNow(running ? 1000 : 30_000);
  const projects = useMemo(() => uniqueSorted(entries.map((e) => e.project)), [entries]);
  const types = useMemo(() => uniqueSorted(entries.map((e) => e.type)), [entries]);
  /** Finished entries saved without a project, oldest first: the "fill in later" queue. */
  const needDetails = useMemo(() => entries.filter((e) => !e.project.trim() && e.end !== null), [entries]);

  /** Updates the screen right away, then saves; on failure, shows the error and reloads what's saved. */
  async function persist(changed: Entry[]) {
    setEntries((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e]));
      for (const e of changed) byId.set(e.id, e);
      return [...byId.values()].sort(compareEntries);
    });
    try {
      await store.saveMany(changed);
    } catch (err) {
      setError(`Couldn't save: ${(err as Error).message}`);
      reload();
    }
  }

  function addEntry(entry: Entry) {
    const created: Entry = { ...entry, id: crypto.randomUUID() };
    const changed: Entry[] = [created];
    // Starting a new timer stops the one that's running.
    if (running && created.end === null) {
      const sameDayAfter = created.date === running.date && toSeconds(created.start) > toSeconds(running.start);
      changed.push({ ...running, end: sameDayAfter ? created.start : clockTime() });
    }
    persist(changed);
  }

  function quickNext() {
    const t = clockTime();
    if (running && running.date === isoDate() && running.start.slice(0, 5) === t) return; // tapped twice in the same minute
    addEntry({ id: '', date: isoDate(), start: t, end: null, project: '', type: '', notes: '' });
  }

  function stopRunning() {
    if (running) persist([{ ...running, end: clockTime() }]);
  }

  async function removeEntry(entry: Entry) {
    if (!window.confirm(`Delete this entry?\n\n${entry.date} ${entry.start.slice(0, 5)} · ${entry.project || 'untitled'}`)) return;
    setEditing(null);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await store.remove(entry.id);
    } catch (err) {
      setError(`Couldn't delete: ${(err as Error).message}`);
      reload();
    }
  }

  function renameAll(field: 'project' | 'type', from: string, to: string) {
    const changed = entries.filter((e) => e[field] === from).map((e) => ({ ...e, [field]: to }));
    if (window.confirm(`Rename "${from}" to "${to}" on ${changed.length} entries?`)) persist(changed);
  }

  async function saveSettings(s: Settings) {
    setSettings(s);
    try {
      await store.saveSettings(s);
    } catch (err) {
      setError(`Couldn't save settings: ${(err as Error).message}`);
    }
  }

  async function importEntries(list: Entry[]) {
    await persist(list);
  }

  function loadSample() {
    persist(makeSampleEntries());
  }

  function clearBrowserData() {
    if (!window.confirm('Erase all entries saved in this browser?')) return;
    clearLocalEntries();
    reload();
  }

  const staleTimer = running && running.date !== isoDate(now);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src="./icon.svg" alt="" width={26} height={26} /> Time Tracker</div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'on' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
        {running && tab !== 'today' && (
          <button className="topbar-timer" onClick={() => setTab('today')} title="Timer running">● {running.project || 'Untitled'}</button>
        )}
      </header>

      <main className="content">
        {demo && (
          <div className="notice demo-banner" role="status">
            <p className="no-margin">
              <strong>Demo mode.</strong> Your entries are saved only in this browser and aren't tied to an account.
              Anyone using this browser can see them, so don't enter anything private on a shared computer.
            </p>
            <div className="form-actions">
              {entries.length === 0 && <button className="primary sm" onClick={loadSample}>Load sample data</button>}
              <button className="ghost sm" onClick={() => setRequesting(true)}>Request an account</button>
              <button className="ghost sm" onClick={onLeaveDemo}>Sign in</button>
            </div>
          </div>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error} <button className="ghost sm" onClick={() => setError('')}>Dismiss</button>
          </p>
        )}
        {staleTimer && (
          <p className="notice" role="status">
            A timer has been running since {running.date}. <button className="ghost sm" onClick={() => setEditing(running)}>Fix it</button>
          </p>
        )}
        {loading ? <p className="empty">Loading your log…</p> : (
          <>
            {tab === 'today' && <Today entries={entries} settings={settings} now={now} running={running} needDetails={needDetails} onAdd={addEntry} onNext={quickNext} onStop={stopRunning} onEdit={setEditing} />}
            {tab === 'log' && <Log entries={entries} settings={settings} now={now} projects={projects} types={types} onEdit={setEditing} />}
            {tab === 'reports' && <Reports entries={entries} settings={settings} now={now} />}
            {tab === 'lists' && <Lists entries={entries} onRename={renameAll} />}
            {tab === 'settings' && (
              <SettingsView
                store={store}
                userEmail={userEmail}
                entries={entries}
                settings={settings}
                onSaveSettings={saveSettings}
                onImport={importEntries}
                demo={demo}
                onLoadSample={loadSample}
                onClearBrowserData={clearBrowserData}
                onSignOut={supabase ? () => { setRememberDevice(false); supabase!.auth.signOut(); } : undefined}
              />
            )}
          </>
        )}
      </main>

      {requesting && supabase && <RequestAccount client={supabase} onClose={() => setRequesting(false)} />}

      <datalist id="dl-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="dl-types">{types.map((t) => <option key={t} value={t} />)}</datalist>

      {editing && (() => {
        const nextUntitled = !editing.project.trim() ? needDetails.find((e) => e.id !== editing.id) : undefined;
        return (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal card" role="dialog" aria-modal="true" aria-label="Edit entry">
            <h2>Edit entry</h2>
            <EntryForm
              key={editing.id}
              initial={editing}
              isNew={false}
              onSubmit={(e) => { persist([e]); setEditing(null); }}
              onDelete={() => removeEntry(editing)}
              onCancel={() => setEditing(null)}
              onSaveAndNext={nextUntitled && ((e) => { persist([e]); setEditing(nextUntitled); })}
            />
          </div>
        </div>
        );
      })()}
    </div>
  );
}
