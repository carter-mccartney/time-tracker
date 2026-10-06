import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type Entry, type Settings } from './types';

/** Where entries live. The app talks only to this interface, so local and cloud behave the same. */
export interface Store {
  kind: 'local' | 'cloud';
  list(): Promise<Entry[]>;
  /** Insert or update (matched by id). */
  saveMany(entries: Entry[]): Promise<void>;
  remove(id: string): Promise<void>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
}

// ---------- This device only (browser storage) ----------

const ENTRIES_KEY = 'tt.entries.v1';
const SETTINGS_KEY = 'tt.settings.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const localStore: Store = {
  kind: 'local',
  async list() {
    return readJson<Entry[]>(ENTRIES_KEY, []);
  },
  async saveMany(changed) {
    const byId = new Map(readJson<Entry[]>(ENTRIES_KEY, []).map((e) => [e.id, e]));
    for (const e of changed) byId.set(e.id, e);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify([...byId.values()]));
  },
  async remove(id) {
    const rest = readJson<Entry[]>(ENTRIES_KEY, []).filter((e) => e.id !== id);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(rest));
  },
  async loadSettings() {
    return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) };
  },
  async saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  },
};

// ---------- Supabase (cloud, signed in) ----------

interface Row {
  id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  project: string;
  type: string;
  notes: string;
}

const COLUMNS = 'id,date,start_time,end_time,project,type,notes';
const PAGE = 1000; // Supabase returns at most 1000 rows per request

const toRow = (e: Entry, userId: string) => ({
  id: e.id,
  user_id: userId,
  date: e.date,
  start_time: e.start,
  end_time: e.end,
  project: e.project,
  type: e.type,
  notes: e.notes,
});

const fromRow = (r: Row): Entry => ({
  id: r.id,
  date: r.date,
  start: r.start_time,
  end: r.end_time,
  project: r.project,
  type: r.type,
  notes: r.notes,
});

export function cloudStore(db: SupabaseClient, userId: string): Store {
  return {
    kind: 'cloud',
    async list() {
      const out: Entry[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('entries')
          .select(COLUMNS)
          .order('date')
          .order('start_time')
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data as Row[]).map(fromRow));
        if (data.length < PAGE) return out;
      }
    },
    async saveMany(changed) {
      for (let i = 0; i < changed.length; i += 500) {
        const rows = changed.slice(i, i + 500).map((e) => toRow(e, userId));
        const { error } = await db.from('entries').upsert(rows);
        if (error) throw error;
      }
    },
    async remove(id) {
      const { error } = await db.from('entries').delete().eq('id', id);
      if (error) throw error;
    },
    async loadSettings() {
      const { data, error } = await db
        .from('settings')
        .select('daily_hours,lunch_allowance_min')
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return { dailyHours: Number(data.daily_hours), lunchAllowanceMin: Number(data.lunch_allowance_min) };
    },
    async saveSettings(s) {
      const { error } = await db.from('settings').upsert({
        user_id: userId,
        daily_hours: s.dailyHours,
        lunch_allowance_min: s.lunchAllowanceMin,
      });
      if (error) throw error;
    },
  };
}
