-- Run in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to run again after updates; it only adds what's missing.
-- Row Level Security means each signed-in user can only ever see and change their own rows.

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time,               -- null while the timer is running
  project     text not null default '',
  type        text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists entries_user_date on public.entries (user_id, date);

create table if not exists public.settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_hours          numeric not null default 9,
  lunch_allowance_min  integer not null default 30
);

-- Signed-in users may use the tables (row-level security below limits them to their own rows).
-- Visitors who aren't signed in get no access at all.
grant select, insert, update, delete on public.entries, public.settings to authenticated;
revoke all on public.entries, public.settings from anon;

alter table public.entries  enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ---------- Account requests (from the "Request an account" form) ----------
-- Visitors can add a request but can never read, change or delete one. Review them in
-- Table Editor > account_requests, then create the person under Authentication > Users.

create table if not exists public.account_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 100),
  email       text not null check (char_length(email) between 3 and 200 and email like '%_@_%'),
  message     text not null default '' check (char_length(message) <= 1000),
  status      text not null default 'new'   -- change to 'approved' / 'declined' as you review
);

revoke all on public.account_requests from anon, authenticated;
grant insert (name, email, message) on public.account_requests to anon, authenticated;

alter table public.account_requests enable row level security;

drop policy if exists "anyone can request" on public.account_requests;
create policy "anyone can request" on public.account_requests
  for insert to anon, authenticated
  with check (true);

-- Flood protection: at most 10 requests per hour across the whole site.
create or replace function public.limit_account_requests() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.account_requests where created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many requests right now. Please try again later.';
  end if;
  return new;
end $$;

drop trigger if exists account_requests_limit on public.account_requests;
create trigger account_requests_limit before insert on public.account_requests
  for each row execute function public.limit_account_requests();

-- ---------- Profiles (display name shown to people you share with) ----------

create table if not exists public.profiles (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 60)
);

grant select, insert, update on public.profiles to authenticated;
revoke all on public.profiles from anon;
alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- Sharing ----------
-- The owner shares their log with another account as 'view' or 'edit'.
--   view: can read entries (notes blanked when hide_notes) and the owner's daily target.
--   edit: can also add and change entries (never delete them). Notes are always visible.
-- Shares are created through share_log() (it looks up the email); either person can delete one.

create table if not exists public.shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewer_id   uuid not null references auth.users (id) on delete cascade,
  permission  text not null default 'view' check (permission in ('view', 'edit')),
  hide_notes  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, viewer_id),
  check (owner_id <> viewer_id),
  check (permission = 'view' or not hide_notes)
);

revoke all on public.shares from anon, authenticated;
grant select, delete on public.shares to authenticated;
grant update (permission, hide_notes) on public.shares to authenticated;
alter table public.shares enable row level security;

drop policy if exists "see own shares" on public.shares;
create policy "see own shares" on public.shares
  for select to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));

drop policy if exists "owner changes share" on public.shares;
create policy "owner changes share" on public.shares
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "either side ends share" on public.shares;
create policy "either side ends share" on public.shares
  for delete to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));

-- Editors: read, add and change the owner's entries directly (no delete policy = no deleting).
drop policy if exists "editors read shared entries" on public.entries;
create policy "editors read shared entries" on public.entries
  for select to authenticated
  using (exists (select 1 from public.shares s
                 where s.owner_id = entries.user_id and s.viewer_id = (select auth.uid()) and s.permission = 'edit'));

drop policy if exists "editors add shared entries" on public.entries;
create policy "editors add shared entries" on public.entries
  for insert to authenticated
  with check (exists (select 1 from public.shares s
                      where s.owner_id = entries.user_id and s.viewer_id = (select auth.uid()) and s.permission = 'edit'));

drop policy if exists "editors change shared entries" on public.entries;
create policy "editors change shared entries" on public.entries
  for update to authenticated
  using (exists (select 1 from public.shares s
                 where s.owner_id = entries.user_id and s.viewer_id = (select auth.uid()) and s.permission = 'edit'))
  with check (exists (select 1 from public.shares s
                      where s.owner_id = entries.user_id and s.viewer_id = (select auth.uid()) and s.permission = 'edit'));

-- An entry can never be moved to a different account.
create or replace function public.keep_entry_owner() returns trigger
language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Entries cannot be moved to another account.';
  end if;
  return new;
end $$;

drop trigger if exists entries_keep_owner on public.entries;
create trigger entries_keep_owner before update on public.entries
  for each row execute function public.keep_entry_owner();

-- People you share with may read your daily target (for their view of your dashboard).
drop policy if exists "shared settings readable" on public.settings;
create policy "shared settings readable" on public.settings
  for select to authenticated
  using (exists (select 1 from public.shares s
                 where s.owner_id = settings.user_id and s.viewer_id = (select auth.uid())));

-- Share your log with an email. Always succeeds quietly, so it can't be used to find out
-- which emails have accounts. Sharing again with the same person updates the permission.
create or replace function public.share_log(p_email text, p_permission text, p_hide_notes boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_viewer uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_permission not in ('view', 'edit') then raise exception 'Unknown permission.'; end if;
  select id into v_viewer from auth.users where lower(email) = lower(trim(p_email));
  if v_viewer is null or v_viewer = auth.uid() then return; end if;
  insert into public.shares (owner_id, viewer_id, permission, hide_notes)
  values (auth.uid(), v_viewer, p_permission, p_permission = 'view' and coalesce(p_hide_notes, false))
  on conflict (owner_id, viewer_id)
  do update set permission = excluded.permission, hide_notes = excluded.hide_notes;
end $$;

-- Your shares in both directions, with the other person's email and display name.
create or replace function public.list_shares()
returns table (id uuid, direction text, other_id uuid, other_email text, other_name text,
               permission text, hide_notes boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id,
         case when s.owner_id = auth.uid() then 'out' else 'in' end,
         u.id, u.email::text, coalesce(p.display_name, ''), s.permission, s.hide_notes, s.created_at
  from public.shares s
  join auth.users u on u.id = case when s.owner_id = auth.uid() then s.viewer_id else s.owner_id end
  left join public.profiles p on p.user_id = u.id
  where s.owner_id = auth.uid() or s.viewer_id = auth.uid()
  order by s.created_at;
$$;

-- Entries of a log shared with you. Notes come back blank when the owner chose "hide notes".
create or replace function public.shared_entries(p_owner uuid)
returns table (id uuid, date date, start_time time, end_time time, project text, type text, notes text)
language sql stable security definer set search_path = public as $$
  select e.id, e.date, e.start_time, e.end_time, e.project, e.type,
         case when s.hide_notes then '' else e.notes end
  from public.entries e
  join public.shares s on s.owner_id = e.user_id and s.viewer_id = auth.uid()
  where e.user_id = p_owner;
$$;

revoke all on function public.share_log(text, text, boolean), public.list_shares(), public.shared_entries(uuid) from public, anon;
grant execute on function public.share_log(text, text, boolean), public.list_shares(), public.shared_entries(uuid) to authenticated;
