import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import PlanDayCard from "./PlanDayCard";
import PlanShell from "./PlanShell";
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
