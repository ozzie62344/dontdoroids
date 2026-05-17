import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import WorkoutForm from "./WorkoutForm";
import StreakCalendar from "@/components/StreakCalendar";
import Link from "next/link";
import { computeStreaks, daysAgoStr, todayStr } from "@/lib/dates";
import { getGoals, startOfWeekStr } from "@/lib/goals";
import { fillPlan, todayDayOfWeek, DAY_LABELS_LONG } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = daysAgoStr(120);
  const { data: rows } = await supabase
    .from("workouts")
    .select("day, kind, notes")
    .eq("user_id", user.id)
    .gte("day", since)
    .order("day", { ascending: false });

  const days = new Set<string>((rows ?? []).map((r) => r.day as string));
  const { current, longest } = computeStreaks(days);
  const today = todayStr();
  const alreadyDoneToday = days.has(today);
  const weekStart = startOfWeekStr();
  const workoutsThisWeek = (rows ?? []).filter((r) => (r.day as string) >= weekStart).length;
  const goalsRow = await getGoals();
  const weeklyGoal = goalsRow?.goals?.weekly_workout_goal ?? null;

  const { data: planRows } = await supabase
    .from("workout_plan")
    .select("day_of_week, focus, is_rest_day, exercises")
    .eq("user_id", user.id);
  const todayPlan = fillPlan(planRows ?? [])[todayDayOfWeek()];
  const hasPlannedToday =
    !todayPlan.is_rest_day && (todayPlan.focus != null || todayPlan.exercises.length > 0);

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-6">
        <section className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white p-6 shadow">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm opacity-80">Current streak</p>
              <p className="text-5xl font-bold leading-none">
                {current} <span className="text-2xl font-medium">day{current === 1 ? "" : "s"}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Longest</p>
              <p className="text-2xl font-semibold">{longest}</p>
            </div>
          </div>
          <p className="mt-3 text-sm opacity-90">
            {alreadyDoneToday
              ? "You crushed today. See you tomorrow."
              : current > 0
              ? "Don't break the chain — log today's workout."
              : "Time to start a new streak."}
          </p>
          {weeklyGoal != null && (
            <div className="mt-4">
              <div className="flex justify-between text-xs opacity-80">
                <span>This week</span>
                <span>
                  {workoutsThisWeek} / {weeklyGoal}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{
                    width: `${Math.min(100, (workoutsThisWeek / Math.max(weeklyGoal, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold">
              Today’s plan
              <span className="text-sm font-normal text-neutral-500 ml-2">
                {DAY_LABELS_LONG[todayDayOfWeek()]}
              </span>
            </h2>
            <Link href="/plan" className="text-xs text-brand-600 hover:underline">
              edit plan →
            </Link>
          </div>
          {todayPlan.is_rest_day ? (
            <p className="text-sm text-neutral-500">Rest day. Don’t feel guilty.</p>
          ) : hasPlannedToday ? (
            <>
              {todayPlan.focus && (
                <p className="text-sm font-medium text-brand-600">{todayPlan.focus}</p>
              )}
              {todayPlan.exercises.length > 0 && (
                <ul className="mt-1 text-sm space-y-0.5">
                  {todayPlan.exercises.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.name}</span>
                      {(e.sets || e.reps) && (
                        <span className="text-neutral-500">
                          {" — "}
                          {e.sets ? `${e.sets}×` : ""}
                          {e.reps ?? ""}
                        </span>
                      )}
                      {e.notes && (
                        <span className="text-xs text-neutral-500"> · {e.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              No plan set.{" "}
              <Link href="/plan" className="text-brand-600 hover:underline">
                Set one →
              </Link>
            </p>
          )}
        </section>

        <WorkoutForm alreadyDoneToday={alreadyDoneToday} />

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="font-semibold mb-3">Last ~3 months</h2>
          <StreakCalendar days={days} />
          <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-neutral-200 dark:bg-neutral-800 inline-block" /> rest
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-brand-500 inline-block" /> workout
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="font-semibold mb-3">Recent workouts</h2>
          {(rows ?? []).length === 0 ? (
            <p className="text-sm text-neutral-500">No workouts yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
              {(rows ?? []).slice(0, 20).map((r) => (
                <li key={r.day as string} className="py-2 flex justify-between">
                  <span>{r.day as string}</span>
                  <span className="text-neutral-500">
                    {r.kind ?? "—"}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
