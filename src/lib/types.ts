/** One row of the time log. `end === null` means the timer is still running. */
export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  start: string; // HH:MM or HH:MM:SS
  end: string | null;
  project: string;
  type: string;
  notes: string;
}

export interface Settings {
  /** Target hours per day (the workbook's "Daily Hours"). */
  dailyHours: number;
  /** Minutes of lunch that count as work time; anything longer is subtracted. */
  lunchAllowanceMin: number;
}

export const DEFAULT_SETTINGS: Settings = { dailyHours: 9, lunchAllowanceMin: 30 };
