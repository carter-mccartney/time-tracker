-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
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
