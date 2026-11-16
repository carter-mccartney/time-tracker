import type ICAL from 'ical.js';
import { clockTime, isoDate } from './time';
import type { Entry } from './types';

/** One meeting occurrence from the calendar feed. */
export interface CalEvent {
  /** Stable for this occurrence at this start time. A moved meeting gets a new key, so it counts as new. */
  key: string;
  title: string;
  start: Date;
  end: Date;
}

/** added = already turned into an entry; missed = ended before it was synced (can be added by hand); new = about to be added. */
export type CalStatus = 'added' | 'missed' | 'new';
export interface CalItem extends CalEvent { status: CalStatus }

export interface CalendarOptions {
  /** Where the meeting title goes on the new entry. */
  titleTarget: 'notes' | 'project';
  /** Type given to new entries, e.g. "Meeting". */
  entryType: string;
}

const MAX_OCCURRENCES = 50_000; // safety stop for very old daily series

/**
 * Timed meetings that start on `day` (local time), with recurring series expanded.
 * Skips all-day events, cancelled meetings and events shown as "Free".
 * The calendar parser is loaded on first use, so people without calendar sync never download it.
 */
export async function eventsOnDay(icsText: string, day: Date): Promise<CalEvent[]> {
  const { default: ICALm } = await import('ical.js');
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  // Moved occurrences are listed under their original date, so look a little past today.
  const scanUntil = new Date(dayEnd.getTime() + 8 * 86_400_000);

  const root = new ICALm.Component(ICALm.parse(icsText));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICALm.TimezoneService.register(tz); } catch { /* ignore a malformed zone */ }
  }

  // Group a series with its changed occurrences (same UID, with RECURRENCE-ID).
  const byUid = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const uid = String(vevent.getFirstPropertyValue('uid') ?? Math.random());
    const group = byUid.get(uid) ?? { exceptions: [] };
    if (vevent.hasProperty('recurrence-id')) group.exceptions.push(vevent);
    else group.master = vevent;
    byUid.set(uid, group);
  }

  const found = new Map<string, CalEvent>();
  const add = (uid: string, item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurrenceId: ICAL.Time | null) => {
    if (start.isDate) return; // all-day
    const comp = item.component;
    if (String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return;
    if (String(comp.getFirstPropertyValue('x-microsoft-cdo-busystatus') ?? '').toUpperCase() === 'FREE') return;
    if (String(comp.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT') return;
    const title = (item.summary || '').trim() || '(No title)';
    if (/^cancell?ed:/i.test(title)) return;
    const s = start.toJSDate();
    const e = end.toJSDate();
    if (s < dayStart || s >= dayEnd) return;
    const key = `${uid}|${recurrenceId ? recurrenceId.toString() : ''}|${s.toISOString()}`;
    found.set(key, { key, title, start: s, end: e > s ? e : s });
  };

  for (const [uid, { master, exceptions }] of byUid) {
    if (!master) {
      // Changed occurrences whose series isn't in the feed: treat each as a single meeting.
      for (const ex of exceptions) {
        const ev = new ICALm.Event(ex);
        add(uid, ev, ev.startDate, ev.endDate, ev.recurrenceId);
      }
      continue;
    }
    const ev = new ICALm.Event(master);
    for (const ex of exceptions) {
      try { ev.relateException(ex); } catch { /* exception for another series: ignore */ }
    }
    if (!ev.isRecurring()) {
      add(uid, ev, ev.startDate, ev.endDate, null);
      continue;
    }
    const it = ev.iterator();
    let next: ICAL.Time | null;
    let n = 0;
    while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
      if (next.toJSDate() > scanUntil) break;
      const d = ev.getOccurrenceDetails(next);
      add(uid, d.item, d.startDate, d.endDate, next);
    }
  }

  return [...found.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Splits today's meetings into already added, missed (ended before syncing) and new ones to add now. */
export function planSync(events: CalEvent[], importedKeys: Set<string>, now: Date) {
  const items: CalItem[] = events.map((e) => ({
    ...e,
    status: importedKeys.has(e.key) ? 'added' : e.end <= now ? 'missed' : 'new',
  }));
  return { items, toAdd: items.filter((i) => i.status === 'new') };
}

export function entryFromEvent(e: CalEvent, opts: CalendarOptions): Entry {
  return {
    id: crypto.randomUUID(),
    date: isoDate(e.start),
    start: clockTime(e.start),
    end: clockTime(e.end),
    project: opts.titleTarget === 'project' ? e.title : '',
    type: opts.entryType.trim(),
    notes: opts.titleTarget === 'notes' ? e.title : '',
  };
}

export interface SyncDeps {
  fetchIcs(): Promise<string>;
  /** Which of these keys were added before (on any device). */
  importedKeys(keys: string[]): Promise<Set<string>>;
  /** Records keys as added; returns only the ones this call recorded (another device may have just done it). */
  claim(keys: string[]): Promise<Set<string>>;
}

/** One sync: returns today's meetings with their status, plus the new entries to save. */
export async function syncToday(deps: SyncDeps, now: Date, opts: CalendarOptions) {
  const events = await eventsOnDay(await deps.fetchIcs(), now);
  const imported = events.length ? await deps.importedKeys(events.map((e) => e.key)) : new Set<string>();
  const { items, toAdd } = planSync(events, imported, now);
  const claimed = toAdd.length ? await deps.claim(toAdd.map((e) => e.key)) : new Set<string>();
  const created = toAdd.filter((e) => claimed.has(e.key)).map((e) => entryFromEvent(e, opts));
  return {
    items: items.map((i) => (i.status === 'new' ? { ...i, status: 'added' as const } : i)),
    created,
  };
}
