import { entryMinutes, fmtClock, fmtDuration, isLunch } from '../lib/time';
import type { Entry } from '../lib/types';

interface Props {
  entries: Entry[];
  now: Date;
  /** Omitted when viewing someone else's log read-only: rows are then not clickable. */
  onEdit?(entry: Entry): void;
  showNotes?: boolean;
  /** When given, finished entries get a "Resume" button that starts a new timer with the same details. */
  onResume?(entry: Entry): void;
}

export function EntryList({ entries, now, onEdit, showNotes = true, onResume }: Props) {
  if (entries.length === 0) return <p className="empty">No entries yet.</p>;
  return (
    <ul className="entry-list">
      {entries.map((e) => {
        const className = `entry-row${e.end ? '' : ' running'}${isLunch(e) ? ' lunch' : ''}${onEdit ? '' : ' static'}`;
        const content = (
          <>
            <span className="er-time">
              {fmtClock(e.start)} – {e.end ? fmtClock(e.end) : <em>running</em>}
            </span>
            <span className="er-dur">{fmtDuration(entryMinutes(e, now))}</span>
            <span className="er-main">
              {e.project ? <span className="er-project">{e.project}</span> : <span className="untitled">{onEdit ? 'Add details' : 'Untitled'}</span>}
              {e.type && <span className="pill">{e.type}</span>}
              {showNotes && e.notes && <span className="er-notes">{e.notes}</span>}
            </span>
          </>
        );
        const canResume = onResume && e.end && e.project.trim();
        return (
          <li key={e.id} className={canResume ? 'has-resume' : undefined}>
            {onEdit ? <button className={className} onClick={() => onEdit(e)}>{content}</button> : <div className={className}>{content}</div>}
            {canResume && (
              <button className="ghost sm er-resume" onClick={() => onResume(e)}
                title={`Start a new timer now for ${e.project}, with the same type and notes`} aria-label={`Resume ${e.project}`}>
                ↻ Resume
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
