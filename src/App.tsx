import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { EntryForm } from './components/EntryForm';
import { Lists } from './components/Lists';
import { Log } from './components/Log';
import { Reports } from './components/Reports';
import { SettingsView } from './components/SettingsView';
import { SetPasswordPage } from './components/PasswordForm';
import { RequestAccount } from './components/RequestAccount';
import { SharingSettings } from './components/SharingSettings';
import { SignIn } from './components/SignIn';
import { Today } from './components/Today';
import { makeSampleEntries } from './lib/sample';
import { listShares, shareLabel, type Share } from './lib/sharing';
import { clearLocalEntries, cloudStore, localStore, sharedStore, type Store } from './lib/store';
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
  const [shares, setShares] = useState<Share[]>([]);
  // Whose log is open: null = your own, otherwise the id of someone who shared theirs with you.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = shares.find((s) => s.direction === 'in' && s.otherId === viewingId);

  const refreshShares = useCallback(async () => {
    if (!supabase || !userId) return setShares([]);
    try {
      setShares(await listShares(supabase));
    } catch {
      setShares([]); // sharing tables not set up yet: the app still works without them
    }
  }, [userId]);

  useEffect(() => {
    refreshShares();
    setViewingId(null);
  }, [refreshShares]);

  const viewOwner = viewing?.otherId;
  const viewPermission = viewing?.permission;
  const store = useMemo(() => {
    if (!supabase || !userId) return localStore;
    if (viewOwner && viewPermission) return sharedStore(supabase, viewOwner, viewPermission);
    return cloudStore(supabase, userId);
  }, [userId, viewOwner, viewPermission]);

  if (!authReady) return <div className="splash">Loading…</div>;
  if (supabase && session && (linkType === 'invite' || linkType === 'recovery')) {
    return <SetPasswordPage client={supabase} invite={linkType === 'invite'} onDone={() => setLinkType(null)} />;
  }
  if (supabase && !session && !demo) {
    return <SignIn client={supabase} onTryDemo={() => { setDemoFlag(true); setDemo(true); }} />;
  }
  return (
    <Tracker
      key={`${userId ?? 'local'}:${viewOwner ?? 'own'}:${viewPermission ?? ''}`}
      store={store}
      userId={userId}
      userEmail={session?.user.email}
      demo={!!supabase && !session}
      onLeaveDemo={() => { setDemoFlag(false); setDemo(false); }}
      viewing={viewing}
      shares={shares}
      onSwitchLog={setViewingId}
      refreshShares={refreshShares}
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
  userId: string | undefined;
  userEmail: string | undefined;
  /** Visitor trying the app without an account: browser-only data, with a banner saying so. */
  demo: boolean;
  onLeaveDemo(): void;
  /** Set when looking at someone else's log that they shared with you. */
  viewing: Share | undefined;
  shares: Share[];
  onSwitchLog(ownerId: string | null): void;
  refreshShares(): Promise<void>;
}

function Tracker({ store, userId, userEmail, demo, onLeaveDemo, viewing, shares, onSwitchLog, refreshShares }: TrackerProps) {
  /** owner = your own log; edit/view = someone else's, with the access they gave you. */
  const access = viewing ? viewing.permission : 'owner';
  const readOnly = access === 'view';
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

  // Someone else's log can change while you look at it: refresh it every minute.
  useEffect(() => {
    if (!viewing) return;
    const id = setInterval(reload, 60_000);
    return () => clearInterval(id);
  }, [viewing, reload]);

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
  const tabs = viewing ? TABS.filter(([key]) => key !== 'settings') : TABS;
  const shownTab: Tab = viewing && tab === 'settings' ? 'today' : tab;
  const incoming = shares.filter((s) => s.direction === 'in');
  const openEditor = readOnly ? undefined : setEditing;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src="./icon.svg" alt="" width={26} height={26} /> Time Tracker</div>
        <nav className="tabs" aria-label="Sections">
          {tabs.map(([key, label]) => (
            <button key={key} className={shownTab === key ? 'on' : ''} aria-current={shownTab === key ? 'page' : undefined} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
        {incoming.length > 0 && (
          <select className="log-switcher" value={viewing?.otherId ?? ''} onChange={(e) => onSwitchLog(e.target.value || null)} aria-label="Whose log to show">
            <option value="">My log</option>
            {incoming.map((s) => (
              <option key={s.id} value={s.otherId}>{shareLabel(s)}'s log{s.permission === 'view' ? ' (view only)' : ''}</option>
            ))}
          </select>
        )}
        {running && shownTab !== 'today' && (
          <button className="topbar-timer" onClick={() => setTab('today')} title="Timer running">● {running.project || 'Untitled'}</button>
        )}
      </header>

      <main className="content">
        {viewing && (
          <div className="notice viewing-banner" role="status">
            <span>
              You're looking at <strong>{shareLabel(viewing)}</strong>'s log
              {readOnly ? ' (view only)' : '. You can add and edit entries, but not delete them'}
              {viewing.hideNotes ? '. Notes are hidden' : ''}. It refreshes every minute.
            </span>
            <button className="ghost sm" onClick={() => onSwitchLog(null)}>Back to my log</button>
          </div>
        )}
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
        {staleTimer && !readOnly && (
          <p className="notice" role="status">
            A timer has been running since {running.date}. <button className="ghost sm" onClick={() => setEditing(running)}>Fix it</button>
          </p>
        )}
        {loading ? <p className="empty">Loading your log…</p> : (
          <>
            {shownTab === 'today' && <Today entries={entries} settings={settings} now={now} running={running} needDetails={needDetails} readOnly={readOnly} onAdd={addEntry} onNext={quickNext} onStop={stopRunning} onEdit={openEditor} />}
            {shownTab === 'log' && <Log entries={entries} settings={settings} now={now} projects={projects} types={types} onEdit={openEditor} />}
            {shownTab === 'reports' && <Reports entries={entries} settings={settings} now={now} />}
            {shownTab === 'lists' && <Lists entries={entries} onRename={readOnly ? undefined : renameAll} />}
            {shownTab === 'settings' && (
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
              >
                {store.kind === 'cloud' && supabase && userId && (
                  <SharingSettings
                    client={supabase}
                    userId={userId}
                    shares={shares}
                    onChanged={refreshShares}
                    onOpenLog={(s) => { onSwitchLog(s.otherId); setTab('today'); }}
                  />
                )}
              </SettingsView>
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
              onDelete={access === 'owner' ? () => removeEntry(editing) : undefined}
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
