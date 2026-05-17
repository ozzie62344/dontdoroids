-- Migration 002: user_goals table for onboarding.
-- Run this in Supabase SQL editor against your existing database.

create table if not exists public.user_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_calorie_goal integer,
  daily_protein_g_goal numeric,
  weekly_workout_goal integer,
  goal_weight_kg numeric,
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_goals enable row level security;

drop policy if exists "own goals" on public.user_goals;
create policy "own goals"
  on public.user_goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
