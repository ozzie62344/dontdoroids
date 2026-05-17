-- Migration 004: daily fat + sugar limits, sugar tracking on food entries.
-- Run this in Supabase SQL editor against your existing database.

alter table public.user_goals
  add column if not exists daily_fat_g_goal numeric,
  add column if not exists daily_sugar_g_goal numeric;

alter table public.food_entries
  add column if not exists sugar_g numeric;
