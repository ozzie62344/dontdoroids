import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import PlanDayCard from "./PlanDayCard";
import PlanShell from "./PlanShell";
import FillWeightsButton from "./FillWeightsButton";
import { fillPlan, todayDayOfWeek } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("workout_plan")
    .select("day_of_week, focus, is_rest_day, exercises")
    .eq("user_id", user.id);

  const plan = fillPlan(rows ?? []);
  const todayIdx = todayDayOfWeek();
  const hasAny = (rows ?? []).length > 0;

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Weekly plan</h1>
            <p className="text-sm text-neutral-500">
              {hasAny
                ? "Tap any day to edit. Today is highlighted."
                : "Tap a day to set what to hit, or let Claude write a plan for you."}
            </p>
          </div>
          <PlanShell />
        </header>

        {hasAny && (
          <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Have a plan without weights? Let Claude fill them in for you →
            </p>
            <FillWeightsButton />
          </section>
        )}

        <div className="space-y-3">
          {plan.map((day) => (
            <PlanDayCard
              key={day.day_of_week}
              day={day}
              isToday={day.day_of_week === todayIdx}
            />
          ))}
        </div>
      </main>
    </>
  );
}
