import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import FoodUploader from "./FoodUploader";
import FoodEntryCard, { type FoodEntry } from "./FoodEntryCard";
import ProgressBar from "@/components/ProgressBar";
import { getGoals } from "@/lib/goals";

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

  const today: FoodEntry[] = (todayRaw ?? []) as FoodEntry[];
  const recent = recentRaw ?? [];
  const goalsRow = await getGoals();
  const goals = goalsRow?.goals;

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

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Today’s meals</h2>
          {today.length === 0 && (
            <p className="text-sm text-neutral-500">Nothing yet. Upload a photo to get started.</p>
          )}
          {today.map((entry) => (
            <FoodEntryCard key={entry.id} entry={entry} />
          ))}
        </section>

        {recent.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Earlier</h2>
            <ul className="text-sm divide-y divide-neutral-200 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              {recent.map((e) => (
                <li key={e.id as string} className="px-3 py-2 flex justify-between">
                  <span>{e.label}</span>
                  <span className="text-neutral-500">
                    {new Date(e.eaten_at as string).toLocaleDateString()} · {e.calories} kcal
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
