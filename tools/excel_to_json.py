"""Convert the "Time Log" sheet of the Excel time tracker into JSON the app can import.

Usage:
    python tools/excel_to_json.py "path/to/AdvancedTimeTracker.xlsm" [output.json]

The output defaults to data/timelog-import.json (git-ignored, so your log never lands in the repo).
Reads the values Excel last calculated, so save the workbook in Excel before running this.
The workbook is never modified, and it can stay open in Excel (unsaved changes won't be included).
Needs: pip install openpyxl
"""

import datetime as dt
import io
import json
import os
import sys
import uuid
import warnings

import openpyxl

SHEET = "Time Log"
TABLE = "TimeTrackerLogTable"
# Stable ids: the same row always gets the same id, so re-importing never duplicates.
NAMESPACE = uuid.UUID("6f1d4a52-7a3e-4b8e-9c1a-2d5e0f7b9a10")


def read_shared(path):
    """Read a file Excel has open. Excel's lock blocks Python's open(), but not a
    Windows read handle that also allows others to read, write and delete."""
    import ctypes
    from ctypes import wintypes

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateFileW.restype = wintypes.HANDLE
    GENERIC_READ, SHARE_ALL, OPEN_EXISTING = 0x80000000, 0x7, 3
    h = k32.CreateFileW(path, GENERIC_READ, SHARE_ALL, None, OPEN_EXISTING, 0, None)
    if h in (None, wintypes.HANDLE(-1).value):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        chunks, buf, n = [], ctypes.create_string_buffer(1 << 20), wintypes.DWORD()
        while k32.ReadFile(h, buf, len(buf), ctypes.byref(n), None) and n.value:
            chunks.append(buf.raw[: n.value])
        return b"".join(chunks)
    finally:
        k32.CloseHandle(h)


def open_workbook(path):
    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
    try:
        return openpyxl.load_workbook(path, data_only=True)
    except PermissionError:  # locked because Excel has it open
        if os.name != "nt":
            raise
        return openpyxl.load_workbook(io.BytesIO(read_shared(path)), data_only=True)


def as_date(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return None


def as_time(v):
    if isinstance(v, dt.datetime):
        return v.time()
    if isinstance(v, dt.time):
        return v
    if isinstance(v, (int, float)):  # Excel serial fraction of a day
        secs = round((v % 1) * 86400) % 86400
        return dt.time(secs // 3600, secs // 60 % 60, secs % 60)
    return None


def text(v):
    return "" if v is None else str(v).strip()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "..", "data", "timelog-import.json")

    ws = open_workbook(src)[SHEET]
    ref = ws.tables[TABLE].ref if TABLE in ws.tables else f"A5:H{ws.max_row}"
    first_row, last_row = ws[ref][0][0].row, ws[ref][-1][0].row
    headers = [text(c.value) for c in ws[first_row]]
    col = {name: headers.index(name) for name in ("Date", "Start Time", "End Time", "Project", "Type", "Notes")}

    entries, skipped, seen, dupes = [], [], set(), 0
    for row in ws.iter_rows(min_row=first_row + 1, max_row=last_row, values_only=True):
        project = text(row[col["Project"]])
        if not project:
            continue  # the pre-filled formula rows below the last entry
        day = as_date(row[col["Date"]])
        start = as_time(row[col["Start Time"]])
        end = as_time(row[col["End Time"]])
        if not day or not start:
            skipped.append(project)
            continue
        entry = {
            "date": day.isoformat(),
            "start": start.strftime("%H:%M:%S"),
            "end": end.strftime("%H:%M:%S") if end else None,
            "project": project,
            "type": text(row[col["Type"]]),
            "notes": text(row[col["Notes"]]),
        }
        entry["id"] = str(uuid.uuid5(NAMESPACE, f'{entry["date"]}|{entry["start"]}|{project}|{entry["notes"][:40]}'))
        if entry["id"] in seen:  # exact duplicate row
            dupes += 1
            continue
        seen.add(entry["id"])
        entries.append(entry)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"source": os.path.basename(src), "entries": entries}, f, indent=1, ensure_ascii=False)

    days = {e["date"] for e in entries}
    print(f"Wrote {len(entries)} entries across {len(days)} days to {os.path.abspath(out)}")
    if entries:
        print(f"Range: {entries[0]['date']} to {entries[-1]['date']}")
    if dupes:
        print(f"Skipped {dupes} exact duplicate rows")
    if skipped:
        print(f"Skipped {len(skipped)} rows with no date/start time: {skipped[:5]}")


if __name__ == "__main__":
    main()
