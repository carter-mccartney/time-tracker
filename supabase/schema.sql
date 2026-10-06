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
