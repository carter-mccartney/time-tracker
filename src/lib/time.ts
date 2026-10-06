import type { Entry } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time as HH:MM. */
export function clockTime(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function atTime(dateIso: string, time: string) {
  const d = parseDate(dateIso);
  const [h, mi, s] = time.split(':').map(Number);
  d.setHours(h, mi, s || 0, 0);
  return d;
}

export function toSeconds(time: string) {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

/** Drops a ":00" seconds part so time inputs show HH:MM. */
export function inputTime(time: string | null) {
  if (!time) return '';
  return time.length > 5 && time.endsWith(':00') ? time.slice(0, 5) : time;
}

export function addDays(iso: string, n: number) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string) {
  const d = parseDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

/** Minutes for an entry; running entries count up to `now`, and an end before the start crosses midnight. */
export function entryMinutes(e: Entry, now = new Date()) {
  const start = atTime(e.date, e.start);
  let end = e.end ? atTime(e.date, e.end) : now;
  if (e.end && end < start) end = new Date(end.getTime() + 86_400_000);
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

export const isLunch = (e: Entry) =>
  e.project.trim().toLowerCase() === 'lunch' || e.type.trim().toLowerCase() === 'lunch';

/**
 * Worked minutes for one day's entries, matching the workbook: lunch up to the
 * allowance counts as work, any lunch beyond it is subtracted.
 */
export function workedMinutes(dayEntries: Entry[], lunchAllowanceMin: number, now = new Date()) {
  let total = 0;
  let lunch = 0;
  for (const e of dayEntries) {
    const m = entryMinutes(e, now);
    total += m;
    if (isLunch(e)) lunch += m;
  }
  return total - Math.max(0, lunch - lunchAllowanceMin);
}

/** Sum of worked minutes across many days (lunch rule applied per day). */
export function workedMinutesByDay(entries: Entry[], lunchAllowanceMin: number, now = new Date()) {
  const byDay = groupBy(entries, (e) => e.date);
  const out = new Map<string, number>();
  for (const [day, list] of byDay) out.set(day, workedMinutes(list, lunchAllowanceMin, now));
  return out;
}

export function groupBy<T>(items: T[], key: (t: T) => string) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = map.get(k);
    if (list) list.push(it);
    else map.set(k, [it]);
  }
  return map;
}

export const compareEntries = (a: Entry, b: Entry) =>
  a.date.localeCompare(b.date) || toSeconds(a.start) - toSeconds(b.start);

export function fmtDuration(min: number) {
  const sign = min < 0 ? '−' : '';
  const m = Math.round(Math.abs(min));
  return `${sign}${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

export const fmtHours = (min: number) => (min / 60).toFixed(2);

export function fmtClock(time: string | Date) {
  const d = typeof time === 'string' ? atTime('2000-01-01', time) : time;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(iso: string, withYear = true) {
  return parseDate(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
