import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import FoodUploader from "./FoodUploader";

export const dynamic = "force-dynamic";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default async function FoodPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const since = startOfTodayISO();
  const { data: today } = await supabase
    .from("food_entries")
    .select("*")
    .eq("user_id", user.id)
    .gte("eaten_at", since)
    .order("eaten_at", { ascending: false });

  const { data: recent } = await supabase
    .from("food_entries")
    .select("*")
    .eq("user_id", user.id)
    .lt("eaten_at", since)
    .order("eaten_at", { ascending: false })
    .limit(15);

  const totals = (today ?? []).reduce(
    (acc, r) => ({
      calories: acc.calories + (r.calories ?? 0),
      protein: acc.protein + Number(r.protein_g ?? 0),
      carbs: acc.carbs + Number(r.carbs_g ?? 0),
      fat: acc.fat + Number(r.fat_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-3xl p-4 space-y-6">
        <section className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5">
          <h1 className="text-xl font-semibold mb-1">Today</h1>
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div>
              <div className="text-2xl font-bold text-brand-600">{totals.calories}</div>
              <div className="text-neutral-500">kcal</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{totals.protein.toFixed(0)}g</div>
              <div className="text-neutral-500">protein</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{totals.carbs.toFixed(0)}g</div>
              <div className="text-neutral-500">carbs</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{totals.fat.toFixed(0)}g</div>
              <div className="text-neutral-500">fat</div>
            </div>
          </div>
        </section>

        <FoodUploader userId={user.id} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Today’s meals</h2>
          {(today ?? []).length === 0 && (
            <p className="text-sm text-neutral-500">Nothing yet. Upload a photo to get started.</p>
          )}
          {(today ?? []).map((entry) => (
            <article
              key={entry.id}
              className="flex gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3"
            >
              {entry.photo_path && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/food-thumb?path=${encodeURIComponent(entry.photo_path)}`}
                  alt={entry.label ?? "Food"}
                  className="w-20 h-20 rounded-lg object-cover bg-neutral-100"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-medium truncate">{entry.label}</h3>
                  <span className="text-xs text-neutral-500">{fmtTime(entry.eaten_at)}</span>
                </div>
                <div className="text-sm">
                  <strong>{entry.calories} kcal</strong>
                  <span className="text-neutral-500">
                    {" "}· P {Number(entry.protein_g ?? 0).toFixed(0)}g · C{" "}
                    {Number(entry.carbs_g ?? 0).toFixed(0)}g · F{" "}
                    {Number(entry.fat_g ?? 0).toFixed(0)}g
                  </span>
                </div>
                {entry.notes && (
                  <p className="text-xs text-neutral-500 line-clamp-2">{entry.notes}</p>
                )}
              </div>
            </article>
          ))}
        </section>

        {(recent ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Earlier</h2>
            <ul className="text-sm divide-y divide-neutral-200 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              {(recent ?? []).map((e) => (
                <li key={e.id} className="px-3 py-2 flex justify-between">
                  <span>{e.label}</span>
                  <span className="text-neutral-500">
                    {new Date(e.eaten_at).toLocaleDateString()} · {e.calories} kcal
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
