import { useState } from 'react';
import { entryMinutes, fmtDay, fmtDuration, groupBy } from '../lib/time';
import type { Entry } from '../lib/types';

interface Props {
  entries: Entry[];
  onRename(field: 'project' | 'type', from: string, to: string): void;
}

/** The workbook's "Projects" sheet: every project/type used so far, with a way to merge typos. */
export function Lists({ entries, onRename }: Props) {
  return (
    <div className="stack">
      <p className="muted">
        These lists fill the Project and Type suggestions. Rename one to fix a typo or merge two names; every entry that uses it is updated.
      </p>
      <div className="two-col">
        <NameList title="Projects" field="project" entries={entries} onRename={onRename} />
        <NameList title="Types" field="type" entries={entries} onRename={onRename} />
      </div>
    </div>
  );
}

function NameList({ title, field, entries, onRename }: Props & { title: string; field: 'project' | 'type' }) {
  const [filter, setFilter] = useState('');
  const rows = [...groupBy(entries.filter((e) => e[field]), (e) => e[field])]
    .map(([name, list]) => ({
      name,
      count: list.length,
      min: list.reduce((a, e) => a + entryMinutes(e), 0),
      last: list.reduce((a, e) => (e.date > a ? e.date : a), ''),
    }))
    .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  function rename(name: string) {
    const to = window.prompt(`Rename "${name}" to (use an existing name to merge):`, name)?.trim();
    if (!to || to === name) return;
    onRename(field, name, to);
  }

  return (
    <section className="card">
      <h2 className="day-head"><span>{title}</span><span className="muted small">{rows.length}</span></h2>
      <input type="search" placeholder={`Filter ${title.toLowerCase()}…`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={`Filter ${title}`} />
      <table className="table">
        <thead><tr><th>Name</th><th className="num">Used</th><th className="num">Time</th><th>Last used</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{r.count}</td>
              <td className="num nowrap">{fmtDuration(r.min)}</td>
              <td className="nowrap muted">{fmtDay(r.last, false)}</td>
              <td><button className="ghost sm" onClick={() => rename(r.name)}>Rename</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
