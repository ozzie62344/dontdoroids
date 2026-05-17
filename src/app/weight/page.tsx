import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import WeightForm from "./WeightForm";
import WeightChart from "@/components/WeightChart";
import { getGoals } from "@/lib/goals";

export const dynamic = "force-dynamic";

function isoWeek(d: Date): string {
  // ISO week (YYYY-Www) for weekly grouping in the table.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default async function WeightPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: metrics } = await supabase
    .from("body_metrics")
    .select("id, measured_on, weight_kg, height_cm, notes")
    .eq("user_id", user.id)
    .order("measured_on", { ascending: false })
    .limit(200);

  const list = metrics ?? [];
  const weightEntries = list.filter((m) => m.weight_kg != null);
  const latestWeight = weightEntries[0];
  const prevWeight = weightEntries[1];
  const latestHeight = list.find((m) => m.height_cm != null)?.height_cm ?? null;
  const goalsRow = await getGoals();
  const goalWeightKg = goalsRow?.goals?.goal_weight_kg ?? null;
  const toGoal =
    latestWeight && goalWeightKg != null
      ? Number(latestWeight.weight_kg) - Number(goalWeightKg)
      : null;

  const delta =
    latestWeight && prevWeight
      ? Number(latestWeight.weight_kg) - Number(prevWeight.weight_kg)
      : null;

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-6">
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <p className="text-xs text-neutral-500">Latest weight</p>
            <p className="text-3xl font-bold">
              {latestWeight ? `${Number(latestWeight.weight_kg).toFixed(1)} kg` : "—"}
            </p>
            {delta != null && (
              <p className={`text-sm ${delta < 0 ? "text-green-600" : "text-orange-600"}`}>
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)} kg vs previous
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
            <p className="text-xs text-neutral-500">
              {goalWeightKg != null ? "To goal" : "Height"}
            </p>
            {goalWeightKg != null ? (
              <>
                <p className="text-3xl font-bold">
                  {toGoal != null ? `${Math.abs(toGoal).toFixed(1)} kg` : "—"}
                </p>
                <p className="text-sm text-neutral-500">
                  {toGoal == null
                    ? `goal: ${Number(goalWeightKg).toFixed(1)} kg`
                    : toGoal > 0
                    ? `to lose · goal ${Number(goalWeightKg).toFixed(1)} kg`
                    : toGoal < 0
                    ? `to gain · goal ${Number(goalWeightKg).toFixed(1)} kg`
                    : `at goal 🎯`}
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold">
                  {latestHeight != null ? `${Number(latestHeight).toFixed(0)} cm` : "—"}
                </p>
                <p className="text-sm text-neutral-500">
                  {latestHeight != null
                    ? `${(Number(latestHeight) / 2.54).toFixed(1)} in`
                    : "Add it once and it'll stick."}
                </p>
              </>
            )}
          </div>
        </section>

        <WeightForm defaultHeightCm={latestHeight ? Number(latestHeight) : null} />

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="font-semibold mb-3">Weight over time</h2>
          <WeightChart
            data={list.map((m) => ({
              measured_on: m.measured_on as string,
              weight_kg: m.weight_kg as number | null,
              height_cm: m.height_cm as number | null,
            }))}
            goalWeightKg={goalWeightKg ? Number(goalWeightKg) : null}
          />
        </section>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="font-semibold mb-3">History</h2>
          {list.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing logged yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1">Week</th>
                  <th>Date</th>
                  <th>Weight</th>
                  <th>Height</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {list.map((m) => (
                  <tr key={m.id as string}>
                    <td className="py-1 text-neutral-500">
                      {isoWeek(new Date(String(m.measured_on) + "T00:00:00"))}
                    </td>
                    <td>{m.measured_on as string}</td>
                    <td>
                      {m.weight_kg != null ? `${Number(m.weight_kg).toFixed(1)} kg` : "—"}
                    </td>
                    <td>
                      {m.height_cm != null ? `${Number(m.height_cm).toFixed(0)} cm` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
