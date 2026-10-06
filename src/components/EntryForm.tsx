import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { clockTime, inputTime, isoDate, toSeconds } from '../lib/time';
import type { Entry } from '../lib/types';

interface Props {
  initial: Entry;
  isNew: boolean;
  onSubmit(entry: Entry): void;
  onDelete?(): void;
  onCancel?(): void;
  /** Shown under the Start field, e.g. "Picks up where your last entry ended". */
  startHint?: string;
}

/** Project/Type inputs use the shared <datalist>s rendered in App (suggestions, but new names allowed). */
export function EntryForm({ initial, isNew, onSubmit, onDelete, onCancel, startHint }: Props) {
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(inputTime(initial.start));
  const [end, setEnd] = useState(inputTime(initial.end));
  const [project, setProject] = useState(initial.project);
  const [type, setType] = useState(initial.type);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState('');

  function changeProject(value: string) {
    setProject(value);
    // Same as the workbook: picking "Lunch" fills in the Lunch type.
    if (value.trim().toLowerCase() === 'lunch' && !type.trim()) setType('Lunch');
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!project.trim()) return setError('Choose or type a project.');
    const s = start || clockTime();
    if (end && toSeconds(end) === toSeconds(s)) return setError('End time is the same as the start time.');
    setError('');
    onSubmit({
      ...initial,
      date: date || isoDate(),
      start: s,
      end: end || null,
      project: project.trim(),
      type: type.trim(),
      notes: notes.trim(),
    });
  }

  const submitOnCtrlEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
  };

  const overnight = end && start && toSeconds(end) < toSeconds(start);
  const label = !isNew ? 'Save changes' : end ? 'Log entry' : 'Start timer';

  return (
    <form className="entry-form" onSubmit={submit} onKeyDown={submitOnCtrlEnter}>
      <div className="form-grid">
        <label className="f-date">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="f-start">
          <span>Start</span>
          <div className="with-btn">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} placeholder="now" />
            <button type="button" className="ghost sm" onClick={() => setStart(clockTime())}>Now</button>
          </div>
          <small>{start ? startHint : 'Blank = now'}</small>
        </label>
        <label className="f-end">
          <span>End</span>
          <div className="with-btn">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            <button type="button" className="ghost sm" onClick={() => setEnd(clockTime())}>Now</button>
          </div>
          <small>{overnight ? 'Ends after midnight' : end ? '' : 'Blank = timer keeps running'}</small>
        </label>
        <label className="f-project">
          <span>Project</span>
          <input list="dl-projects" value={project} onChange={(e) => changeProject(e.target.value)} placeholder="Pick or type a new one" autoComplete="off" />
        </label>
        <label className="f-type">
          <span>Type</span>
          <input list="dl-types" value={type} onChange={(e) => setType(e.target.value)} placeholder="Meeting, Task, Project…" autoComplete="off" />
        </label>
        <label className="f-notes">
          <span>Notes</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you work on?" />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary">{label}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
        {onDelete && (
          <button type="button" className="danger ghost push-right" onClick={onDelete}>Delete</button>
        )}
        {isNew && <span className="kbd-hint">Ctrl+Enter to submit</span>}
      </div>
    </form>
  );
}
