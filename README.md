# Time Tracker

A personal time log for tracking work on projects, tasks and meetings. It replaces an Excel workbook (`Time Log` sheet) and keeps the same behavior:

- **Today dashboard**: time worked, time left against a daily target (9h), probable end time, and hours this week.
- **Lunch rule**: up to 30 minutes of lunch counts as work time, and anything longer is subtracted. You can change this in Settings.
- **Quick entry**: the date fills in by itself, and the start time picks up where the last entry ended.
- **Project and Type suggestions**: built from every name you've used before, and typing a new name adds it. Picking project "Lunch" sets the type to "Lunch".
- **Timer**: start a task with the end time left blank. Starting the next task stops the current one.
- **Log**: every entry grouped by day, with search and filters. Click an entry to edit or delete it.
- **Reports**: totals by project, type and day for this week, last week, a month, or custom dates. You can export CSV or print.
- **Projects & Types**: see every name with its usage. Rename one to fix a typo or merge two names.
- **Import & backup**: import from the workbook, and export JSON (backup) or CSV (Excel).

Built with React + TypeScript + Vite. Data is stored either in the browser ("this device only") or in [Supabase](https://supabase.com) (sign-in, synced everywhere).

## Run it on this PC

Double-click **`Start Time Tracker.cmd`**. The first run installs dependencies, then the app opens at http://localhost:5173.

You can also start it from a terminal:

```bash
npm install
```

```bash
npm run dev
```

Without Supabase configured, entries are saved in that browser only. Use **Settings → Export backup** regularly until you connect the cloud.

## Import the Excel history

```bash
python tools/excel_to_json.py "C:\path\to\AdvancedTimeTracker_v0.2.xlsm"
```

This writes `data/timelog-import.json`, then you use **Settings → Import JSON…** in the app. The `data/` folder is git-ignored, so your log never goes into the repo. The script reads the values Excel last saved. It never modifies the workbook, and the workbook can stay open in Excel. Re-importing is safe because entries that already exist are skipped. That means you can keep using Excel during the transition and import again later.

## Connect Supabase (sync across devices)

1. Create a project at supabase.com. Free tier is fine.
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the tables and locks every row to its owner.
3. **Project Settings → API**: copy the Project URL and the `anon` public key into a new file `.env.local`, using [`.env.example`](.env.example) as the template. The anon key is safe to publish, because the row-level security from step 2 is what protects the data.
4. Turn on GitHub sign-in:
   - On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**. Set Homepage URL to your site URL, and Authorization callback URL to `https://<your-project>.supabase.co/auth/v1/callback`.
   - In Supabase, go to **Authentication → Sign In / Providers → GitHub**, enable it, and paste in the Client ID and Secret.
   - In Supabase, go to **Authentication → URL Configuration**. Set Site URL to your GitHub Pages URL, and add `http://localhost:5173` to Redirect URLs.
5. Restart the app and sign in with GitHub.
6. If you used the app before connecting, go to **Settings → Copy them to the cloud** to move this browser's entries into Supabase. Otherwise import the Excel JSON there.
7. **Recommended:** after your account exists, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. That way no one else can create an account in your project.

## Publish to GitHub Pages

1. Create a repo, then push this folder to `main`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. In the repo, go to **Settings → Secrets and variables → Actions → Variables**. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Every push to `main` builds and deploys through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The site is at `https://<user>.github.io/<repo>/`.

## Project layout

```
src/
  App.tsx              app shell, tabs, saving logic
  components/          Today, Log, Reports, Lists (projects & types), Settings, EntryForm, SignIn
  lib/time.ts          date/time math, lunch rule, formatting
  lib/store.ts         storage: browser (local) and Supabase (cloud) behind one interface
  lib/files.ts         CSV/JSON export and import
supabase/schema.sql    database tables + row-level security
tools/excel_to_json.py one-time import from the Excel workbook
```
