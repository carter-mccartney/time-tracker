import { CalendarCard } from './CalendarCard';
import { EntryForm } from './EntryForm';
import type { CalendarSync } from '../lib/useCalendarSync';
import { EntryList } from './EntryList';
import {
  entryMinutes, fmtClock, fmtDay, fmtDuration, inputTime, isoDate, toSeconds,
  weekStart, workedMinutes, workedMinutesByDay,
} from '../lib/time';
import type { Entry, Settings } from '../lib/types';

interface Props {
  entries: Entry[];
  settings: Settings;
  now: Date;
  running: Entry | undefined;
  needDetails: Entry[];
  /** Viewing someone else's log with view-only access. */
  readOnly?: boolean;
  /** Present when calendar sync is set up. */
  calendar?: CalendarSync;
  onAdd(entry: Entry): void;
  /** One tap: end the running entry now (if any) and start a new, untitled one. */
  onNext(): void;
  onStop(): void;
  onEdit?(entry: Entry): void;
}

export function Today({ entries, settings, now, running, needDetails, readOnly, calendar, onAdd, onNext, onStop, onEdit }: Props) {
  const today = isoDate(now);
  const todays = entries.filter((e) => e.date === today);
  // "Worked" only counts time that has already happened; "logged" also includes entries added ahead of time.
  const worked = workedMinutes(todays, settings.lunchAllowanceMin, now, true);
  const logged = workedMinutes(todays, settings.lunchAllowanceMin, now);
  const target = settings.dailyHours * 60;
  const left = target - worked;
  const monday = weekStart(today);
  const weekMin = [...workedMinutesByDay(entries.filter((e) => e.date >= monday && e.date <= today), settings.lunchAllowanceMin, now, true).values()]
    .reduce((a, b) => a + b, 0);
  const pctOf = (min: number) => Math.min(100, Math.max(0, (min / target) * 100));

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
        <ProgressRow label="So far" hint="Time that has already happened" minutes={worked} pct={pctOf(worked)} target={settings.dailyHours} />
        <ProgressRow label="Logged" hint="Includes entries logged ahead of time" minutes={logged} pct={pctOf(logged)} target={settings.dailyHours} upcoming />
        {logged - worked >= 1 && (
          <p className="progress-note muted small">{fmtDuration(logged - worked)} of today's logged time hasn't happened yet.</p>
        )}
      </section>

      <section className={`card quick${running ? ' is-running' : ''}`} aria-label="Quick log">
        <div className="running-info">
          <span className={running ? 'pulse' : 'idle-dot'} aria-hidden />
          <div>
            <div className="running-title">
              {running ? (running.project || <span className="untitled">Untitled</span>) : 'Not tracking'}
              {running?.type && <span className="pill">{running.type}</span>}
            </div>
            <div className="muted small">
              {running
                ? <>Since {fmtClock(running.start)}{running.date !== today && ` on ${fmtDay(running.date, false)}`}{running.notes && ` · ${running.notes}`}</>
                : lastEnded ? `Last entry ended at ${fmtClock(lastEnded.end!)}` : 'Tap Start when you begin.'}
            </div>
          </div>
        </div>
        <div className="running-actions">
          {running && <span className="running-elapsed">{fmtDuration(entryMinutes(running, now))}</span>}
          {readOnly ? null : running ? (
            <>
              <button className="primary" onClick={onNext} title="End this entry now and start a new one">Next</button>
              <button className="ghost" onClick={onStop}>Stop</button>
              <button className="ghost" onClick={() => onEdit?.(running)}>Details</button>
            </>
          ) : (
            <button className="primary" onClick={onNext}>Start now</button>
          )}
        </div>
        {!readOnly && <p className="quick-help muted small">
          {running
            ? <><strong>Next</strong> ends this entry at {fmtClock(now)} and starts a new one. Add project and notes whenever you have a moment.</>
            : <><strong>Start now</strong> begins an untitled entry at {fmtClock(now)}. You can name it later.</>}
        </p>}
      </section>

      {calendar && !readOnly && <CalendarCard calendar={calendar} />}

      {!readOnly && needDetails.length > 0 && (
        <p className="notice needs" role="status">
          {needDetails.length === 1 ? '1 entry needs' : `${needDetails.length} entries need`} a project.
          <button className="ghost sm" onClick={() => onEdit?.(needDetails[0])}>Fill in details</button>
        </p>
      )}

      <section className="card">
        <h2>Today · {fmtDay(today)}</h2>
        <EntryList entries={todays} now={now} onEdit={onEdit} />
      </section>

      {!readOnly && <details className="card add-entry">
        <summary><h2>Add an entry with specific times</h2></summary>
        <p className="muted small">For time you didn't track live. Only the times are needed; the rest can wait. Leaving End blank starts a timer{running ? ' and stops the current one' : ''}.</p>
        <EntryForm
          key={`${entries.length}-${running?.id ?? ''}-${lastEnded?.id ?? ''}`}
          initial={blank}
          isNew
          onSubmit={onAdd}
          startHint={lastEnded ? 'Picks up where your last entry ended' : ''}
        />
      </details>}
    </div>
  );
}

function ProgressRow({ label, hint, minutes, pct, target, upcoming }: {
  label: string; hint: string; minutes: number; pct: number; target: number; upcoming?: boolean;
}) {
  return (
    <div className="progress-row" title={hint}>
      <span className="progress-name">{label}</span>
      <div className={`progress${upcoming ? ' upcoming' : ''}`} role="progressbar" aria-label={`${label}: ${hint}`}
        aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-value">{fmtDuration(minutes)} · {Math.round(pct)}% of {target}h</span>
    </div>
  );
}
