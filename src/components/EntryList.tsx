import { entryMinutes, fmtClock, fmtDuration, isLunch } from '../lib/time';
import type { Entry } from '../lib/types';

interface Props {
  entries: Entry[];
  now: Date;
  onEdit(entry: Entry): void;
  showNotes?: boolean;
}

export function EntryList({ entries, now, onEdit, showNotes = true }: Props) {
  if (entries.length === 0) return <p className="empty">No entries yet.</p>;
  return (
    <ul className="entry-list">
      {entries.map((e) => (
        <li key={e.id}>
          <button className={`entry-row${e.end ? '' : ' running'}${isLunch(e) ? ' lunch' : ''}`} onClick={() => onEdit(e)}>
            <span className="er-time">
              {fmtClock(e.start)} – {e.end ? fmtClock(e.end) : <em>running</em>}
            </span>
            <span className="er-dur">{fmtDuration(entryMinutes(e, now))}</span>
            <span className="er-main">
              <span className="er-project">{e.project}</span>
              {e.type && <span className="pill">{e.type}</span>}
              {showNotes && e.notes && <span className="er-notes">{e.notes}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
