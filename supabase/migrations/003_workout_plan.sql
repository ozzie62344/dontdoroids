-- Migration 003: weekly workout_plan table.
-- Run this in Supabase SQL editor against your existing database.

create table if not exists public.workout_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0=Mon..6=Sun
  focus text,
  is_rest_day boolean not null default false,
  exercises jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, day_of_week)
);

alter table public.workout_plan enable row level security;

drop policy if exists "own plan" on public.workout_plan;
create policy "own plan"
  on public.workout_plan
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
