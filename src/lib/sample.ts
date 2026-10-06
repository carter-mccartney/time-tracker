import { addDays, isoDate, parseDate, pad } from './time';
import type { Entry } from './types';

/** Made-up entries for demo mode, so a visitor sees a filled-in dashboard and reports. */
export function makeSampleEntries(today = isoDate()): Entry[] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];

  const work: [string, string, string[]][] = [
    ['Website Redesign', 'Project', ['Built the new pricing page layout.', 'Fixed mobile menu spacing.', 'Reviewed design feedback and updated mockups.']],
    ['Inventory System', 'Project', ['Wrote the stock-level report query.', 'Tested barcode import with sample files.', 'Cleaned up duplicate part numbers.']],
    ['Helpdesk', 'Task', ['Reset a printer queue for accounting.', 'Set up a laptop for a new hire.', 'Answered VPN questions.']],
    ['Client Onboarding', 'Project', ['Drafted the onboarding checklist.', 'Prepared training slides.']],
    ['Email', 'Emails', ['Inbox cleanup and replies.']],
    ['Team Sync', 'Meeting', ['Weekly priorities and blockers.']],
    ['Vendor Call', 'Meeting', ['Reviewed renewal options with the vendor.']],
    ['Learning', 'Learning', ['Worked through a SQL performance course.']],
  ];

  const out: Entry[] = [];
  const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const add = (date: string, start: number, end: number | null, project: string, type: string, notes: string) =>
    out.push({ id: crypto.randomUUID(), date, start: fmt(start), end: end === null ? null : fmt(end), project, type, notes });

  for (let back = 14; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = parseDate(date).getDay();
    if (dow === 0 || dow === 6) continue;
    const isToday = back === 0;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    let t = 8 * 60 + Math.floor(rand() * 4) * 5; // starts 8:00–8:15
    let hadLunch = false;
    while (t < 17 * 60 + 30) {
      if (isToday && t >= nowMin - 5) break; // nothing in the future
      if (!hadLunch && t >= 11 * 60 + 45) {
        const len = 25 + Math.floor(rand() * 4) * 5;
        if (isToday && t + len > nowMin) break;
        add(date, t, t + len, 'Lunch', 'Lunch', '');
        t += len;
        hadLunch = true;
        continue;
      }
      const [project, type, notes] = pick(work);
      const len = type === 'Meeting' ? 30 : 30 + Math.floor(rand() * 7) * 15;
      if (isToday && t + len > nowMin) {
        // Today: one finished-but-untitled entry and a running timer, to show "fill in later".
        if (nowMin - t > 10) add(date, t, nowMin - 5, '', '', '');
        add(date, Math.max(t, nowMin - 5), null, 'Website Redesign', 'Project', 'Working on the contact form.');
        break;
      }
      add(date, t, t + len, project, type, pick(notes));
      t += len;
    }
  }
  return out;
}
