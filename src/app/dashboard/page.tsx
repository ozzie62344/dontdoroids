import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import ProgressBar from "@/components/ProgressBar";
import { computeStreaks, daysAgoStr } from "@/lib/dates";
import { getGoals, startOfWeekStr } from "@/lib/goals";
import { todayDayOfWeek, type Exercise } from "@/lib/plan";

export const dynamic = "force-dynamic";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const goalsRow = await getGoals();
  if (!goalsRow?.goals?.onboarding_completed_at) {
    redirect("/onboarding");
  }
  const goals = goalsRow.goals;

  const weekStart = startOfWeekStr();
  const todayDow = todayDayOfWeek();

  const [todayFood, workouts, weekWorkouts, latestMetric, todaysPlan] = await Promise.all([
    supabase
      .from("food_entries")
      .select("calories, protein_g, fat_g, sugar_g")
      .eq("user_id", user.id)
      .gte("eaten_at", startOfTodayISO()),
    supabase
      .from("workouts")
      .select("day")
      .eq("user_id", user.id)
      .gte("day", daysAgoStr(120)),
    supabase
      .from("workouts")
      .select("day", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("day", weekStart),
    supabase
      .from("body_metrics")
      .select("weight_kg, measured_on")
      .eq("user_id", user.id)
      .not("weight_kg", "is", null)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_plan")
      .select("focus, is_rest_day, exercises")
      .eq("user_id", user.id)
      .eq("day_of_week", todayDow)
      .maybeSingle(),
  ]);

  const todayCalories = (todayFood.data ?? []).reduce(
    (a, r) => a + (r.calories ?? 0),
    0,
  );
  const todayProtein = (todayFood.data ?? []).reduce(
    (a, r) => a + Number(r.protein_g ?? 0),
    0,
  );
  const todayFat = (todayFood.data ?? []).reduce(
    (a, r) => a + Number(r.fat_g ?? 0),
    0,
  );
  const todaySugar = (todayFood.data ?? []).reduce(
    (a, r) => a + Number(r.sugar_g ?? 0),
    0,
  );
  const { current } = computeStreaks(
    new Set((workouts.data ?? []).map((r) => r.day as string)),
  );
  const workoutsThisWeek = weekWorkouts.count ?? 0;
  const latestWeight = latestMetric.data?.weight_kg
    ? Number(latestMetric.data.weight_kg).toFixed(1)
    : null;
  const goalWeight = goals.goal_weight_kg ? Number(goals.goal_weight_kg).toFixed(1) : null;
  const planRow = todaysPlan.data;
  const planExercises = Array.isArray(planRow?.exercises)
    ? (planRow.exercises as Exercise[])
    : [];
  const hasPlanToday =
    planRow != null && (planRow.is_rest_day || planRow.focus || planExercises.length > 0);

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-4">
        <h1 className="text-2xl font-semibold">
          Hey{user.email ? `, ${user.email.split("@")[0]}` : ""} 👋
        </h1>
        <p className="text-neutral-500 text-sm">Here&apos;s the snapshot.</p>

        <Link
          href="/food"
          className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 hover:border-brand-500 transition"
        >
          <p className="text-xs uppercase tracking-wide text-neutral-500">Today</p>
          <div className="flex justify-between items-baseline mt-1">
            <p className="text-3xl font-bold text-brand-600">
              {todayCalories}
              {goals.daily_calorie_goal != null && (
                <span className="text-neutral-400 text-xl font-medium">
                  {" "}/ {goals.daily_calorie_goal}
                </span>
              )}
            </p>
            <span className="text-sm text-neutral-500">kcal</span>
          </div>
          {goals.daily_calorie_goal != null && (
            <ProgressBar value={todayCalories} max={goals.daily_calorie_goal} className="mt-2" />
          )}
          {goals.daily_protein_g_goal != null && (
            <div className="mt-3">
              <div className="flex justify-between text-sm">
                <span>
                  Protein{" "}
                  <strong>
                    {todayProtein.toFixed(0)}g / {Number(goals.daily_protein_g_goal).toFixed(0)}g
                  </strong>
                </span>
              </div>
              <ProgressBar
                value={todayProtein}
                max={Number(goals.daily_protein_g_goal)}
                className="mt-1"
              />
            </div>
          )}
          {goals.daily_fat_g_goal != null && (
            <div className="mt-2">
              <div className="flex justify-between text-sm">
                <span>
                  Fat (limit){" "}
                  <strong>
                    {todayFat.toFixed(0)}g / {Number(goals.daily_fat_g_goal).toFixed(0)}g
                  </strong>
                </span>
              </div>
              <ProgressBar
                value={todayFat}
                max={Number(goals.daily_fat_g_goal)}
                className="mt-1"
              />
            </div>
          )}
          {goals.daily_sugar_g_goal != null && (
            <div className="mt-2">
              <div className="flex justify-between text-sm">
                <span>
                  Sugar (limit){" "}
                  <strong>
                    {todaySugar.toFixed(0)}g / {Number(goals.daily_sugar_g_goal).toFixed(0)}g
                  </strong>
                </span>
              </div>
              <ProgressBar
                value={todaySugar}
                max={Number(goals.daily_sugar_g_goal)}
                className="mt-1"
              />
            </div>
          )}
          <p className="mt-3 text-sm text-brand-600">Log a meal →</p>
        </Link>

        <Link
          href="/workout"
          className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 hover:border-brand-500 transition"
        >
          <p className="text-xs uppercase tracking-wide text-neutral-500">Workouts</p>
          <div className="flex justify-between items-baseline mt-1">
            <p className="text-3xl font-bold text-brand-600">
              {current}
              <span className="text-neutral-400 text-xl font-medium">
                {" "}day{current === 1 ? "" : "s"} streak
              </span>
            </p>
          </div>
          {goals.weekly_workout_goal != null && (
            <div className="mt-3">
              <div className="flex justify-between text-sm">
                <span>
                  This week{" "}
                  <strong>
                    {workoutsThisWeek} / {goals.weekly_workout_goal}
                  </strong>
                </span>
              </div>
              <ProgressBar
                value={workoutsThisWeek}
                max={goals.weekly_workout_goal}
                className="mt-1"
              />
            </div>
          )}
          {hasPlanToday && (
            <div className="mt-3 border-t border-neutral-200 dark:border-neutral-800 pt-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Today’s plan</p>
              {planRow!.is_rest_day ? (
                <p className="text-neutral-500">Rest day</p>
              ) : (
                <>
                  {planRow!.focus && (
                    <p className="font-medium text-brand-600">{planRow!.focus}</p>
                  )}
                  {planExercises.length > 0 && (
                    <p className="text-neutral-600 dark:text-neutral-400 truncate">
                      {planExercises.map((e) => e.name).join(" · ")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <p className="mt-3 text-sm text-brand-600">Log today →</p>
        </Link>

        <Link
          href="/weight"
          className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 hover:border-brand-500 transition"
        >
          <p className="text-xs uppercase tracking-wide text-neutral-500">Weight</p>
          <p className="text-3xl font-bold text-brand-600 mt-1">
            {latestWeight ? `${latestWeight} kg` : "—"}
            {goalWeight && (
              <span className="text-neutral-400 text-xl font-medium">
                {" "}→ {goalWeight} kg
              </span>
            )}
          </p>
          <p className="text-sm text-neutral-500">
            {latestMetric.data?.measured_on
              ? `as of ${latestMetric.data.measured_on}`
              : "No measurement yet"}
          </p>
          <p className="mt-3 text-sm text-brand-600">Log measurement →</p>
        </Link>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="font-semibold mb-2">Tips</h2>
          <ul className="list-disc list-inside text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
            <li>Photo your meal before the first bite — better lighting, better estimate.</li>
            <li>Workouts count once per day. Even a 15-min walk keeps the streak.</li>
            <li>Weigh in same time of day for clean weekly trends (e.g. Sunday morning).</li>
            <li>
              Change goals any time in{" "}
              <Link href="/settings" className="text-brand-600 hover:underline">
                Settings
              </Link>
              .
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
