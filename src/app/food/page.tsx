import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import FoodUploader from "./FoodUploader";
import FoodDescriber from "./FoodDescriber";
import FoodEntryCard, { type FoodEntry } from "./FoodEntryCard";
import RecentEntries from "./RecentEntries";
import ProgressBar from "@/components/ProgressBar";
import { getGoals } from "@/lib/goals";
import { daysAgoStr, toLocalDateStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function FoodPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = startOfTodayISO();
  const { data: todayRaw } = await supabase
    .from("food_entries")
    .select("id, eaten_at, photo_path, label, calories, protein_g, carbs_g, fat_g, sugar_g, notes")
    .eq("user_id", user.id)
    .gte("eaten_at", since)
    .order("eaten_at", { ascending: false });

  const { data: recentRaw } = await supabase
    .from("food_entries")
    .select("id, eaten_at, label, calories")
    .eq("user_id", user.id)
    .lt("eaten_at", since)
    .order("eaten_at", { ascending: false })
    .limit(15);

  // Past 7 days (today + 6) for the weekly summary.
  const weekFromISO = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d.toISOString();
  })();
  const { data: weekRaw } = await supabase
    .from("food_entries")
    .select("eaten_at, calories")
    .eq("user_id", user.id)
    .gte("eaten_at", weekFromISO);

  const today: FoodEntry[] = (todayRaw ?? []) as FoodEntry[];
  const recent = (recentRaw ?? []) as {
    id: string;
    eaten_at: string;
    label: string | null;
    calories: number | null;
  }[];
  const goalsRow = await getGoals();
  const goals = goalsRow?.goals;

  // Build a Map of YYYY-MM-DD -> total kcal for the last 7 days.
  const dayTotals = new Map<string, number>();
  for (let i = 6; i >= 0; i--) dayTotals.set(daysAgoStr(i), 0);
  for (const row of weekRaw ?? []) {
    const key = toLocalDateStr(new Date(row.eaten_at as string));
    if (dayTotals.has(key)) {
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + (row.calories ?? 0));
    }
  }
  const weekDays = [...dayTotals.entries()];
  const weekAvg = Math.round(
    weekDays.reduce((a, [, kcal]) => a + kcal, 0) / weekDays.length,
  );
  const weekMax = Math.max(1, ...weekDays.map(([, k]) => k));

  const totals = today.reduce(
    (acc, r) => ({
      calories: acc.calories + (r.calories ?? 0),
      protein: acc.protein + Number(r.protein_g ?? 0),
      carbs: acc.carbs + Number(r.carbs_g ?? 0),
      fat: acc.fat + Number(r.fat_g ?? 0),
      sugar: acc.sugar + Number(r.sugar_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 },
  );

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-6">
        <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <h1 className="text-xl font-semibold">Today</h1>
          <div className="grid grid-cols-5 gap-2 text-center text-sm">
            <div>
              <div className="text-xl font-bold text-brand-600">{totals.calories}</div>
              <div className="text-xs text-neutral-500">kcal</div>
            </div>
            <div>
              <div className="text-xl font-bold">{totals.protein.toFixed(0)}g</div>
              <div className="text-xs text-neutral-500">protein</div>
            </div>
            <div>
              <div className="text-xl font-bold">{totals.carbs.toFixed(0)}g</div>
              <div className="text-xs text-neutral-500">carbs</div>
            </div>
            <div>
              <div className="text-xl font-bold">{totals.fat.toFixed(0)}g</div>
              <div className="text-xs text-neutral-500">fat</div>
            </div>
            <div>
              <div className="text-xl font-bold">{totals.sugar.toFixed(0)}g</div>
              <div className="text-xs text-neutral-500">sugar</div>
            </div>
          </div>
          {goals?.daily_calorie_goal != null && (
            <div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>kcal</span>
                <span>
                  {totals.calories} / {goals.daily_calorie_goal}
                </span>
              </div>
              <ProgressBar value={totals.calories} max={goals.daily_calorie_goal} />
            </div>
          )}
          {goals?.daily_protein_g_goal != null && (
            <div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>protein</span>
                <span>
                  {totals.protein.toFixed(0)}g / {Number(goals.daily_protein_g_goal).toFixed(0)}g
                </span>
              </div>
              <ProgressBar
                value={totals.protein}
                max={Number(goals.daily_protein_g_goal)}
              />
            </div>
          )}
          {goals?.daily_fat_g_goal != null && (
            <div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>fat (limit)</span>
                <span>
                  {totals.fat.toFixed(0)}g / {Number(goals.daily_fat_g_goal).toFixed(0)}g
                </span>
              </div>
              <ProgressBar value={totals.fat} max={Number(goals.daily_fat_g_goal)} />
            </div>
          )}
          {goals?.daily_sugar_g_goal != null && (
            <div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>sugar (limit)</span>
                <span>
                  {totals.sugar.toFixed(0)}g / {Number(goals.daily_sugar_g_goal).toFixed(0)}g
                </span>
              </div>
              <ProgressBar value={totals.sugar} max={Number(goals.daily_sugar_g_goal)} />
            </div>
          )}
        </section>

        <FoodUploader userId={user.id} />
        <FoodDescriber />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Today’s meals</h2>
          {today.length === 0 && (
            <p className="text-sm text-neutral-500">Nothing yet. Upload a photo or type what you ate.</p>
          )}
          {today.map((entry) => (
            <FoodEntryCard key={entry.id} entry={entry} />
          ))}
        </section>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3">
          <div className="flex justify-between items-baseline">
            <h2 className="text-lg font-semibold">Past 7 days</h2>
            <span className="text-xs text-neutral-500">avg {weekAvg} kcal/day</span>
          </div>
          <ul className="space-y-1.5">
            {weekDays.map(([day, kcal]) => {
              const label = new Date(day + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "numeric",
                day: "numeric",
              });
              const pct = Math.round((kcal / weekMax) * 100);
              return (
                <li key={day} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-neutral-500">{label}</span>
                  <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-14 text-right tabular-nums">{kcal} kcal</span>
                </li>
              );
            })}
          </ul>
        </section>

        {recent.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Earlier</h2>
            <RecentEntries entries={recent} />
          </section>
        )}
      </main>
    </>
  );
}
