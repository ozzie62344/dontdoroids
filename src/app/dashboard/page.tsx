import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import { computeStreaks, daysAgoStr } from "@/lib/dates";

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

  const [todayFood, workouts, latestMetric] = await Promise.all([
    supabase
      .from("food_entries")
      .select("calories")
      .eq("user_id", user.id)
      .gte("eaten_at", startOfTodayISO()),
    supabase
      .from("workouts")
      .select("day")
      .eq("user_id", user.id)
      .gte("day", daysAgoStr(120)),
    supabase
      .from("body_metrics")
      .select("weight_kg, measured_on")
      .eq("user_id", user.id)
      .not("weight_kg", "is", null)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const todayCalories = (todayFood.data ?? []).reduce(
    (a, r) => a + (r.calories ?? 0),
    0,
  );
  const { current } = computeStreaks(
    new Set((workouts.data ?? []).map((r) => r.day as string)),
  );
  const latestWeight = latestMetric.data?.weight_kg
    ? Number(latestMetric.data.weight_kg).toFixed(1)
    : null;

  const cards = [
    {
      href: "/food",
      label: "Today's calories",
      value: `${todayCalories}`,
      sub: "kcal logged today",
      cta: "Add a meal photo →",
    },
    {
      href: "/workout",
      label: "Workout streak",
      value: `${current}`,
      sub: current === 1 ? "day in a row" : "days in a row",
      cta: "Log today →",
    },
    {
      href: "/weight",
      label: "Latest weight",
      value: latestWeight ? `${latestWeight} kg` : "—",
      sub: latestMetric.data?.measured_on
        ? `as of ${latestMetric.data.measured_on}`
        : "Not logged yet",
      cta: "Log measurement →",
    },
  ];

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-4">
        <h1 className="text-2xl font-semibold">
          Hey{user.email ? `, ${user.email.split("@")[0]}` : ""} 👋
        </h1>
        <p className="text-neutral-500 text-sm">Here's the snapshot.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 hover:border-brand-500 transition"
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</p>
              <p className="text-3xl font-bold text-brand-600 mt-1">{c.value}</p>
              <p className="text-sm text-neutral-500">{c.sub}</p>
              <p className="mt-3 text-sm text-brand-600">{c.cta}</p>
            </Link>
          ))}
        </div>

        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
          <h2 className="font-semibold mb-2">Tips</h2>
          <ul className="list-disc list-inside text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
            <li>Photo your meal before the first bite — better lighting, better estimate.</li>
            <li>Workouts count once per day. Even a 15-min walk keeps the streak.</li>
            <li>Weigh in same time of day for clean weekly trends (e.g. Sunday morning).</li>
          </ul>
        </section>
      </main>
    </>
  );
}
