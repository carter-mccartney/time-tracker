import { useMemo, useState } from 'react';
import { EntryList } from './EntryList';
import { fmtDay, fmtDuration, groupBy, workedMinutes } from '../lib/time';
import type { Entry, Settings } from '../lib/types';

interface Props {
  entries: Entry[];
  settings: Settings;
  now: Date;
  projects: string[];
  types: string[];
  onEdit(entry: Entry): void;
}

const PAGE_DAYS = 30;
const NO_PROJECT = '__needs_details__';

export function Log({ entries, settings, now, projects, types, onEdit }: Props) {
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [days, setDays] = useState(PAGE_DAYS);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (!project || (project === NO_PROJECT ? !e.project : e.project === project)) &&
        (!type || e.type === type) &&
        (!from || e.date >= from) &&
        (!to || e.date <= to) &&
        (!needle || `${e.project} ${e.type} ${e.notes}`.toLowerCase().includes(needle)),
    );
  }, [entries, q, project, type, from, to]);

  const grouped = [...groupBy(filtered, (e) => e.date)].sort((a, b) => b[0].localeCompare(a[0]));
  const filtering = q || project || type || from || to;

  return (
    <div className="stack">
      <section className="card filters">
        <input type="search" placeholder="Search notes, projects, types…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          <option value={NO_PROJECT}>Needs details (no project)</option>
          {projects.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {filtering && (
          <button className="ghost sm" onClick={() => { setQ(''); setProject(''); setType(''); setFrom(''); setTo(''); }}>Clear</button>
        )}
        <span className="muted small push-right">{filtered.length} entries · {grouped.length} days</span>
      </section>

      {grouped.length === 0 && <p className="empty">Nothing matches.</p>}
      {grouped.slice(0, days).map(([day, list]) => (
        <section className="card" key={day}>
          <h2 className="day-head">
            <span>{fmtDay(day)}</span>
            <span className="muted">{fmtDuration(workedMinutes(list, settings.lunchAllowanceMin, now))} worked</span>
          </h2>
          <EntryList entries={list} now={now} onEdit={onEdit} />
        </section>
      ))}
      {grouped.length > days && (
        <button className="ghost center-btn" onClick={() => setDays(days + PAGE_DAYS)}>
          Show older ({grouped.length - days} more days)
        </button>
      )}
    </div>
  );
}
