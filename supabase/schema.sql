-- dontdoroids schema
-- Run this in the Supabase SQL editor after creating your project.

-- =========================================
-- food_entries: one row per photo / meal log
-- =========================================
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  eaten_at timestamptz not null default now(),
  photo_path text,            -- key in the "food-photos" storage bucket
  label text,                 -- short food name e.g. "Chicken burrito bowl"
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text,
  ai_raw jsonb                -- full Claude response for debugging / re-use
);

create index if not exists food_entries_user_eaten_idx
  on public.food_entries (user_id, eaten_at desc);

alter table public.food_entries enable row level security;

drop policy if exists "own food entries" on public.food_entries;
create policy "own food entries"
  on public.food_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================
-- workouts: one row per completed workout day
-- =========================================
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text,                  -- "lift", "cardio", "yoga", etc.
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, day)       -- one streak credit per day
);

create index if not exists workouts_user_day_idx
  on public.workouts (user_id, day desc);

alter table public.workouts enable row level security;

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts"
  on public.workouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================
-- body_metrics: weekly weight + height log
-- =========================================
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric,
  height_cm numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists body_metrics_user_date_idx
  on public.body_metrics (user_id, measured_on desc);

alter table public.body_metrics enable row level security;

drop policy if exists "own body metrics" on public.body_metrics;
create policy "own body metrics"
  on public.body_metrics
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================
-- workout_plan: weekly schedule (one row per user x weekday)
-- =========================================
create table if not exists public.workout_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0=Mon..6=Sun
  focus text,                                            -- "Push", "Legs", etc.
  is_rest_day boolean not null default false,
  exercises jsonb not null default '[]'::jsonb,          -- [{name, sets, reps, notes}]
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

-- =========================================
-- user_goals: one row per user, set during onboarding
-- =========================================
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

-- =========================================
-- Storage bucket for food photos
-- Run these in the SQL editor too. Bucket is private — photos are
-- served via signed URLs from the server.
-- =========================================
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', false)
on conflict (id) do nothing;

drop policy if exists "users upload own food photos" on storage.objects;
create policy "users upload own food photos"
  on storage.objects
  for insert
  with check (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users read own food photos" on storage.objects;
create policy "users read own food photos"
  on storage.objects
  for select
  using (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users delete own food photos" on storage.objects;
create policy "users delete own food photos"
  on storage.objects
  for delete
  using (
    bucket_id = 'food-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
