import { createClient } from "@/lib/supabase/server";
import { addDaysStr, todayDayOfWeekSun0, todayStr } from "@/lib/dates";

export type UserGoals = {
  daily_calorie_goal: number | null;
  daily_protein_g_goal: number | null;
  daily_fat_g_goal: number | null;
  daily_sugar_g_goal: number | null;
  weekly_workout_goal: number | null;
  goal_weight_kg: number | null;
  onboarding_completed_at: string | null;
};

export async function getGoals(): Promise<{ userId: string; goals: UserGoals | null } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_goals")
    .select(
      "daily_calorie_goal, daily_protein_g_goal, daily_fat_g_goal, daily_sugar_g_goal, weekly_workout_goal, goal_weight_kg, onboarding_completed_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  return { userId: user.id, goals: (data as UserGoals | null) ?? null };
}

/** Monday-start of the current week (YYYY-MM-DD), anchored to APP_TIMEZONE. */
export function startOfWeekStr(): string {
  const dow = todayDayOfWeekSun0(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addDaysStr(todayStr(), mondayOffset);
}
