import { fmtClock } from '../lib/time';
import type { CalendarSync } from '../lib/useCalendarSync';

/** Today's meetings from the synced calendar, with what happened to each one. */
export function CalendarCard({ calendar }: { calendar: CalendarSync }) {
  const { items, lastSync, syncing, error } = calendar;
  return (
    <section className="card">
      <h2 className="day-head">
        <span>Today's meetings</span>
        <span className="muted small">
          {syncing ? 'Syncing…' : lastSync ? `Synced ${fmtClock(lastSync)}` : ''}{' '}
          <button className="ghost sm" onClick={calendar.syncNow} disabled={syncing}>Sync now</button>
        </span>
      </h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && items.length === 0 && <p className="muted small no-margin">{lastSync ? 'No meetings on your calendar today.' : 'Checking your calendar…'}</p>}
      {items.length > 0 && (
        <ul className="cal-list">
          {items.map((i) => (
            <li key={i.key}>
              <span className="er-time">{fmtClock(i.start)} – {fmtClock(i.end)}</span>
              <span className="cal-title">{i.title}</span>
              {i.status === 'added' ? (
                <span className="pill">Added</span>
              ) : (
                <span className="cal-missed">
                  <span className="muted small">Ended before syncing</span>
                  <button className="ghost sm" onClick={() => calendar.addMissed(i)}>Add</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small no-margin cal-help">
        Meetings are added once, when they haven't ended yet. After that the entry is yours: edit, move or delete it freely. A meeting moved to a new time today shows up as a new entry.
      </p>
    </section>
  );
}
