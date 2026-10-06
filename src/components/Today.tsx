import { EntryForm } from './EntryForm';
import { EntryList } from './EntryList';
import {
  clockTime, entryMinutes, fmtClock, fmtDay, fmtDuration, inputTime, isoDate, toSeconds,
  weekStart, workedMinutes, workedMinutesByDay,
} from '../lib/time';
import type { Entry, Settings } from '../lib/types';

interface Props {
  entries: Entry[];
  settings: Settings;
  now: Date;
  running: Entry | undefined;
  onAdd(entry: Entry): void;
  onStop(): void;
  onEdit(entry: Entry): void;
}

export function Today({ entries, settings, now, running, onAdd, onStop, onEdit }: Props) {
  const today = isoDate(now);
  const todays = entries.filter((e) => e.date === today);
  const worked = workedMinutes(todays, settings.lunchAllowanceMin, now);
  const target = settings.dailyHours * 60;
  const left = target - worked;
  const monday = weekStart(today);
  const weekMin = [...workedMinutesByDay(entries.filter((e) => e.date >= monday && e.date <= today), settings.lunchAllowanceMin, now).values()]
    .reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.max(0, (worked / target) * 100));

  // Like the workbook: the next entry starts where the last one ended.
  const lastEnded = todays.filter((e) => e.end).sort((a, b) => toSeconds(b.end!) - toSeconds(a.end!))[0];
  const defaultStart = running ? '' : lastEnded ? inputTime(lastEnded.end) : '';
  const blank: Entry = { id: '', date: today, start: defaultStart, end: null, project: '', type: '', notes: '' };

  return (
    <div className="stack">
      <section className="stats" aria-label="Today at a glance">
        <div className="stat">
          <span className="stat-label">Worked today</span>
          <span className="stat-value">{fmtDuration(worked)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{left >= 0 ? 'Time left' : 'Over target'}</span>
          <span className="stat-value">{fmtDuration(Math.abs(left))}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Probable end</span>
          <span className="stat-value">{left > 0 ? fmtClock(new Date(now.getTime() + left * 60_000)) : 'Done'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">This week</span>
          <span className="stat-value">{fmtDuration(weekMin)}</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
          <span className="progress-label">{Math.round(pct)}% of {settings.dailyHours}h</span>
        </div>
      </section>

      {running && (
        <section className="card running-card">
          <div className="running-info">
            <span className="pulse" aria-hidden />
            <div>
              <div className="running-title">{running.project}{running.type && <span className="pill">{running.type}</span>}</div>
              <div className="muted">
                Since {fmtClock(running.start)}{running.date !== today && ` on ${fmtDay(running.date, false)}`}
                {running.notes && ` · ${running.notes}`}
              </div>
            </div>
          </div>
          <div className="running-actions">
            <span className="running-elapsed">{fmtDuration(entryMinutes(running, now))}</span>
            <button className="primary" onClick={onStop}>Stop at {fmtClock(clockTime(now))}</button>
            <button className="ghost" onClick={() => onEdit(running)}>Edit</button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>{running ? 'Switch to a new task' : 'New entry'}</h2>
        {running && <p className="muted small">Starting a new timer stops the current one at the new start time.</p>}
        <EntryForm
          key={`${entries.length}-${running?.id ?? ''}-${lastEnded?.id ?? ''}`}
          initial={blank}
          isNew
          onSubmit={onAdd}
          startHint={lastEnded ? 'Picks up where your last entry ended' : ''}
        />
      </section>

      <section className="card">
        <h2>Today · {fmtDay(today)}</h2>
        <EntryList entries={todays} now={now} onEdit={onEdit} />
      </section>
    </div>
  );
}
