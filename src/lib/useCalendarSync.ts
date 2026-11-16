import { useCallback, useEffect, useRef, useState } from 'react';
import { entryFromEvent, syncToday, type CalItem, type SyncDeps } from './calendar';
import type { CalendarSettings } from './calendarCloud';
import type { Entry } from './types';

const AUTO_SYNC_MS = 10 * 60_000; // every 10 minutes while the app is open
const FOCUS_SYNC_MIN_MS = 2 * 60_000; // and when you come back to the tab, at most every 2 minutes

export interface CalendarSync {
  /** null = not set up. */
  settings: CalendarSettings | null;
  items: CalItem[];
  lastSync: Date | null;
  syncing: boolean;
  error: string;
  syncNow(): Promise<void>;
  /** Adds a meeting that ended before it was synced (by hand, from the list). */
  addMissed(item: CalItem): Promise<void>;
  /** Re-reads settings after they change in Settings. */
  reloadSettings(): Promise<void>;
}

interface Options {
  enabled: boolean;
  deps: SyncDeps | null;
  loadSettings(): Promise<CalendarSettings | null>;
  /** Saves new entries into the log. */
  onCreate(entries: Entry[]): void;
}

/** Keeps today's calendar meetings in step with the log, following the rules in lib/calendar.ts. */
export function useCalendarSync({ enabled, deps, loadSettings, onCreate }: Options): CalendarSync {
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [items, setItems] = useState<CalItem[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const onCreateRef = useRef(onCreate);
  onCreateRef.current = onCreate;
  const lastSyncRef = useRef(lastSync);
  lastSyncRef.current = lastSync;

  const reloadSettings = useCallback(async () => {
    if (!enabled) return setSettings(null);
    try {
      setSettings(await loadSettings());
    } catch {
      setSettings(null); // calendar tables not set up yet: the feature just stays hidden
    }
  }, [enabled, loadSettings]);

  useEffect(() => { reloadSettings(); }, [reloadSettings]);

  const syncNow = useCallback(async () => {
    if (!enabled || !deps || !settings || busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      const now = new Date();
      const result = await syncToday(deps, now, settings);
      if (result.created.length) onCreateRef.current(result.created);
      setItems(result.items);
      setLastSync(now);
      setError('');
    } catch (err) {
      setError((err as Error).message || 'Calendar sync failed.');
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [enabled, deps, settings]);

  // Sync on open, every 10 minutes, and when the tab comes back into view.
  useEffect(() => {
    if (!settings) return;
    syncNow();
    const timer = setInterval(syncNow, AUTO_SYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!lastSyncRef.current || Date.now() - lastSyncRef.current.getTime() > FOCUS_SYNC_MIN_MS)) syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [settings, syncNow]);

  const addMissed = useCallback(async (item: CalItem) => {
    if (!deps || !settings) return;
    try {
      const claimed = await deps.claim([item.key]);
      if (claimed.has(item.key)) onCreateRef.current([entryFromEvent(item, settings)]);
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'added' } : i)));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [deps, settings]);

  return { settings, items, lastSync, syncing, error, syncNow, addMissed, reloadSettings };
}
