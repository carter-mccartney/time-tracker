import { useMemo, useState } from 'react';
import { download, entriesToCsv } from '../lib/files';
import {
  addDays, clockTime, compareEntries, entryMinutes, fmtClock, fmtDay, fmtDuration, fmtHours,
  groupBy, isoDate, parseDate, weekStart, workedMinutesByDay,
} from '../lib/time';
import type { Entry, Settings } from '../lib/types';

type Preset = 'today' | 'week' | 'lastweek' | 'month' | 'lastmonth' | 'custom';

function presetRange(p: Preset, today: string): [string, string] {
  const d = parseDate(today);
  switch (p) {
    case 'today': return [today, today];
    case 'week': return [weekStart(today), today];
    case 'lastweek': { const s = addDays(weekStart(today), -7); return [s, addDays(s, 6)]; }
    case 'month': return [isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), today];
    case 'lastmonth': return [isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoDate(new Date(d.getFullYear(), d.getMonth(), 0))];
    default: return [today, today];
  }
}

interface Props { entries: Entry[]; settings: Settings; now: Date }

export function Reports({ entries, settings, now }: Props) {
  const today = isoDate(now);
  const [preset, setPreset] = useState<Preset>('week');
  const [custom, setCustom] = useState<[string, string]>(presetRange('week', today));
  const [showDetail, setShowDetail] = useState(false);
  const [from, to] = preset === 'custom' ? custom : presetRange(preset, today);

  const inRange = useMemo(
    () => entries.filter((e) => e.date >= from && e.date <= to).sort(compareEntries),
    [entries, from, to],
  );
  const byDay = workedMinutesByDay(inRange, settings.lunchAllowanceMin, now);
  const total = [...byDay.values()].reduce((a, b) => a + b, 0);
  const daysWorked = byDay.size;

  const breakdown = (key: (e: Entry) => string) =>
    [...groupBy(inRange, key)]
      .map(([name, list]) => ({ name: name || 'No project yet', count: list.length, min: list.reduce((a, e) => a + entryMinutes(e, now), 0) }))
      .sort((a, b) => b.min - a.min);
  const byProject = breakdown((e) => e.project);
  const byType = breakdown((e) => e.type);
  const rawTotal = byProject.reduce((a, r) => a + r.min, 0);

  const presets: [Preset, string][] = [
    ['today', 'Today'], ['week', 'This week'], ['lastweek', 'Last week'],
    ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom'],
  ];

  return (
    <div className="stack">
      <section className="card filters no-print">
        <div className="seg" role="group" aria-label="Date range">
          {presets.map(([p, label]) => (
            <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>{label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <label className="inline">From <input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} /></label>
            <label className="inline">To <input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} /></label>
          </>
        )}
        <span className="push-right" />
        <button className="ghost sm" onClick={() => download(`time-log_${from}_to_${to}.csv`, entriesToCsv(inRange), 'text/csv')}>Export CSV</button>
        <button className="ghost sm" onClick={() => window.print()}>Print</button>
      </section>

      <h2 className="report-title">
        {from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`}
        <span className="print-only muted small"> · generated {fmtDay(today)} {fmtClock(clockTime(now))}</span>
      </h2>

      <section className="stats">
        <div className="stat"><span className="stat-label">Total worked</span><span className="stat-value">{fmtDuration(total)}</span></div>
        <div className="stat"><span className="stat-label">Days worked</span><span className="stat-value">{daysWorked}</span></div>
        <div className="stat"><span className="stat-label">Avg per day</span><span className="stat-value">{fmtDuration(daysWorked ? total / daysWorked : 0)}</span></div>
        <div className="stat"><span className="stat-label">Entries</span><span className="stat-value">{inRange.length}</span></div>
      </section>

      {inRange.length === 0 ? <p className="empty">No entries in this range.</p> : (
        <>
          <div className="two-col">
            <Breakdown title="By project" rows={byProject} total={rawTotal} />
            <Breakdown title="By type" rows={byType} total={rawTotal} />
          </div>
          {daysWorked > 1 && (
            <section className="card">
              <h2>By day</h2>
              <table className="table">
                <thead><tr><th>Day</th><th className="num">Worked</th><th className="num">Hours</th></tr></thead>
                <tbody>
                  {[...byDay].sort((a, b) => a[0].localeCompare(b[0])).map(([day, min]) => (
                    <tr key={day}><td>{fmtDay(day)}</td><td className="num">{fmtDuration(min)}</td><td className="num">{fmtHours(min)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="card">
            <h2 className="day-head">
              <span>Detail</span>
              <label className="inline no-print"><input type="checkbox" checked={showDetail} onChange={(e) => setShowDetail(e.target.checked)} /> Show every entry</label>
            </h2>
            {showDetail ? (
              <table className="table detail">
                <thead><tr><th>Date</th><th>Time</th><th className="num">Dur.</th><th>Project</th><th>Type</th><th>Notes</th></tr></thead>
                <tbody>
                  {inRange.map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap">{fmtDay(e.date, false)}</td>
                      <td className="nowrap">{fmtClock(e.start)}–{e.end ? fmtClock(e.end) : '…'}</td>
                      <td className="num">{fmtDuration(entryMinutes(e, now))}</td>
                      <td>{e.project}</td><td>{e.type}</td><td className="notes-cell">{e.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted small">Turn on to list each entry with its notes (included when printing).</p>}
          </section>
          <p className="muted small">
            Project and type totals are clock time. "Total worked" applies the lunch rule: lunch over {settings.lunchAllowanceMin} min per day isn't counted.
          </p>
        </>
      )}
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: { name: string; count: number; min: number }[]; total: number }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <table className="table">
        <thead><tr><th>Name</th><th className="num">Time</th><th className="num">%</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const pct = total ? (r.min / total) * 100 : 0;
            return (
              <tr key={r.name}>
                <td>
                  <div className="bar-cell">
                    <span>{r.name} <span className="muted small">×{r.count}</span></span>
                    <span className="bar" style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td className="num nowrap">{fmtDuration(r.min)}</td>
                <td className="num">{pct.toFixed(0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
