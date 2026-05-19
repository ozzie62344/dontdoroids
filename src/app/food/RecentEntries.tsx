"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RecentRow = {
  id: string;
  eaten_at: string;
  label: string | null;
  calories: number | null;
};

export default function RecentEntries({ entries }: { entries: RecentRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function logAgain(id: string) {
    setBusyId(id);
    setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not logged in");
      setBusyId(null);
      return;
    }
    const { data: src, error: fetchErr } = await supabase
      .from("food_entries")
      .select("photo_path, label, calories, protein_g, carbs_g, fat_g, sugar_g, notes, ai_raw")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (fetchErr || !src) {
      setErr(fetchErr?.message ?? "Could not load entry");
      setBusyId(null);
      return;
    }
    const { error: insertErr } = await supabase.from("food_entries").insert({
      user_id: user.id,
      photo_path: src.photo_path,
      label: src.label,
      calories: src.calories,
      protein_g: src.protein_g,
      carbs_g: src.carbs_g,
      fat_g: src.fat_g,
      sugar_g: src.sugar_g,
      notes: src.notes,
      ai_raw: src.ai_raw,
    });
    setBusyId(null);
    if (insertErr) {
      setErr(insertErr.message);
      return;
    }
    router.refresh();
  }

  if (entries.length === 0) return null;

  return (
    <>
      <ul className="text-sm divide-y divide-neutral-200 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        {entries.map((e) => (
          <li key={e.id} className="px-3 py-2 flex justify-between items-center gap-2">
            <span className="truncate">{e.label}</span>
            <span className="text-neutral-500 flex-shrink-0 text-xs">
              {new Date(e.eaten_at).toLocaleDateString()} · {e.calories} kcal
            </span>
            <button
              onClick={() => logAgain(e.id)}
              disabled={busyId === e.id}
              className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              title="Log this meal again for today"
            >
              {busyId === e.id ? "…" : "↻ Again"}
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </>
  );
}
