import { entryMinutes, fmtHours } from './time';
import type { Entry } from './types';

export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV that opens cleanly in Excel (BOM so accented characters survive). */
export function entriesToCsv(entries: Entry[]) {
  const header = ['Date', 'Start Time', 'End Time', 'Duration (h)', 'Minutes', 'Project', 'Type', 'Notes'];
  const lines = entries.map((e) => {
    const min = entryMinutes(e);
    return [e.date, e.start, e.end ?? '', fmtHours(min), Math.round(min), e.project, e.type, e.notes]
      .map(csvCell)
      .join(',');
  });
  return '﻿' + [header.join(','), ...lines].join('\r\n');
}

/** Accepts either a bare array of entries or { entries: [...] } (the app's backup format). */
export function parseEntriesJson(text: string): Entry[] {
  const data = JSON.parse(text);
  const list: unknown[] = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(list)) throw new Error('No entries found in that file.');
  return list.map((raw, i) => {
    const r = raw as Partial<Entry>;
    if (!r.date || !r.start) throw new Error(`Entry ${i + 1} is missing a date or start time.`);
    return {
      id: r.id || crypto.randomUUID(),
      date: r.date,
      start: r.start,
      end: r.end ?? null,
      project: r.project ?? '',
      type: r.type ?? '',
      notes: r.notes ?? '',
    };
  });
}

/** Key used to skip entries that already exist when importing the same file twice. */
export const entryKey = (e: Entry) => `${e.date}|${e.start.slice(0, 5)}|${e.project.trim().toLowerCase()}`;
