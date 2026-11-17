# Time Tracker

A personal time log for tracking work on projects, tasks and meetings. It replaces an Excel workbook (`Time Log` sheet) and keeps the same behavior:

- **Today dashboard**: time worked, time left against a daily target (9h), probable end time, and hours this week. Two bars show time that has **already happened** and time **logged** (including entries added ahead of time, like a meeting later today).
- **Lunch rule**: up to 30 minutes of lunch counts as work time, and anything longer is subtracted. You can change this in Settings.
- **Quick entry**: the date fills in by itself, and the start time picks up where the last entry ended.
- **Project and Type suggestions**: built from every name you've used before, and typing a new name adds it. Picking project "Lunch" sets the type to "Lunch".
- **Quick log**: tap **Start now** and **Next** to capture times as you go, such as in and out of meetings. Project, type and notes are optional, and entries without them are flagged so you can fill them in later (**Fill in details → Save & next untitled**).
- **Timer**: start a task with the end time left blank. Starting the next task stops the current one.
- **Resume after an interruption**: pulled away from a task, such as a training paused for someone's phone call? Tap **Next** and log the side work. When you return, tap **↻ Back to Training**: it ends the side task and starts a new Training entry right then, with the same project, type and notes. Nothing overlaps, so nothing is counted twice, and reports add the pieces together. Any finished entry on the Today list also has a **↻ Resume** button.
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

## Connect Supabase (sign in and sync across devices)

1. Create a project at supabase.com. Free tier is fine.
2. Go to **SQL Editor → New query**, paste in all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables and makes sure each signed-in person only ever sees their own rows. It's safe to run again after updates.
3. Go to **Project Settings → API**. Copy the **Project URL** (`https://xxxx.supabase.co`, with nothing after `.co`) and the `anon` public key into `.env.local`, using [`.env.example`](.env.example) as the template. The anon key is safe to publish, because row-level security is what protects the data.
4. Create your login:
   - Go to **Authentication → Users → Add user → Create new user**.
   - Enter your email and a password, and tick **Auto Confirm User**.
   - Then go to **Authentication → Sign In / Providers**, turn **off** "Allow new users to sign up", and save. Nobody else can create an account in your project after that.
5. Go to **Authentication → URL Configuration** and set **Site URL** to your GitHub Pages address. Add `http://localhost:5173` to **Redirect URLs**. These are only used by the "email me a sign-in link" option.
6. Sign in from the app on each device.
   - Leave **Keep me signed in on this device** ticked on your own laptop and phone, and you won't be asked again until you sign out.
   - Untick it on a shared computer, and closing the browser signs you out.
   - Signing in on one device never signs anyone in anywhere else.
7. If you used the app before connecting, open **Settings** in the browser where that data lives and click **Copy them to the cloud**, then **Erase this browser's copy**. You can also import the Excel JSON there instead.

Optional: GitHub sign-in can be turned on too. Set up a GitHub OAuth App and enable the GitHub provider in Supabase, then add a repo variable `VITE_ENABLE_GITHUB_LOGIN` = `true`.

## Sharing the app with others

The site is meant for you, but visitors can still try it out:

- **Try it without an account:** this button is on the sign-in page. It opens the full app with data saved only in the visitor's own browser, under a "Demo mode" banner. **Load sample data** fills it with made-up entries. Demo mode never touches the database.
- **Request an account:** a short form (name, email, note). Visitors can submit a request but can't read anyone's request. The site accepts at most 10 per hour.

**To approve someone:**
1. Look at **Supabase → Table Editor → account_requests**.
2. Go to **Authentication → Users → Add user → Create new user**. Enter their email and a temporary password, and tick **Auto Confirm User**.
3. Give them the temporary password yourself, by text or in person. They sign in and change it under **Settings → Change password**.
4. Optionally set the request's `status` to `approved`.

Everyone's entries are private to their own account. Row-level security makes the database return only the signed-in person's rows. You, as the project owner, can see everything in the Supabase dashboard.

**Email limits.** Supabase's built-in email sends at most **2 emails per hour**, and **only to members of your Supabase organization's team**. "Invite user" emails won't reach other people, which is why approval uses a temporary password. "Forgot password?" works for you if your login email matches your Supabase account email. If a password ever needs resetting otherwise, set a new temporary one under **Authentication → Users** (⋯ menu on the user).

## Calendar sync (Teams / Outlook meetings)

The app can add today's meetings to your log automatically. Teams meetings live in your Outlook calendar.

**How it decides what to add:**
- Only **today's** timed meetings are considered, with recurring series expanded for today. All-day, cancelled and "Free" events are skipped.
- A meeting is added **once**, when the app syncs before it has ended. Syncs happen when the app opens, every 10 minutes while it's open, and when you come back to the tab.
- Once created, an entry is yours. If the meeting is later moved or cancelled, the entry isn't changed or removed. If you delete the entry, it isn't re-added.
- A meeting moved to a **new time today** counts as new, so a second entry appears. Keep whichever one is right.
- Meetings that ended before the app synced are never added automatically. They're listed on the Today page with an **Add** button in case you want them.

**One-time setup:**
1. **Publish your calendar.** In Outlook on the web, go to **Settings → Calendar → Shared calendars → Publish a calendar**. Choose **Calendar** and **Can view titles and locations**, click **Publish**, and copy the **ICS** link. Anyone with this link can see your meeting titles, so keep it private. **Reset links** on the same page makes a new one. If "Publish a calendar" is missing, your organization has turned it off.
2. **Run the SQL.** Run [`supabase/schema.sql`](supabase/schema.sql) again in the SQL Editor. It adds the `calendar_settings` and `calendar_imports` tables.
3. **Deploy the proxy.** Go to **Supabase → Edge Functions → Deploy a new function → Via editor**. Name it `calendar-proxy`, paste in [`supabase/functions/calendar-proxy/index.ts`](supabase/functions/calendar-proxy/index.ts), and deploy, leaving **Verify JWT** on. Browsers can't download Outlook calendar links directly, so this function fetches *your saved link only*, and only from Outlook or Google calendar hosts.
4. **Turn it on.** In the app, go to **Settings → Calendar sync**, paste the ICS link, and choose whether the meeting title goes into Notes (the default, so you pick the project later) or Project.

## Sharing your log with another account

In **Settings → Share your log**, enter another account holder's email and choose an access level:

- **Can view:** they see your Today dashboard (including what's running now), Log, Reports and Projects & Types, but can't change anything. Tick **Hide my notes** to share times and projects only. The database blanks notes before sending them, so they can't be recovered.
- **Can add & edit:** they can also add entries and change existing ones. They can never delete entries or change your settings. Editors always see notes.

They open your log from the **My log ▾** switcher at the top of their screen, and it refreshes every minute. Set **Your name** in Settings so they see it instead of your email. You can change access or **Remove** someone at any time, and they can **Leave** a log shared with them. The confirmation after sharing is the same whether or not the email has an account, so the form can't be used to find out who has one.

## Publish to GitHub Pages

1. Create a repo, then push this folder to `main`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. In the repo, go to **Settings → Secrets and variables → Actions**. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as either Variables or Secrets; the workflow accepts both. Without them, the site saves data only in each browser and has no sign-in, and the build log shows a warning.
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
