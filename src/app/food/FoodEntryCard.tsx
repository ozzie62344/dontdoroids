"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type FoodEntry = {
  id: string;
  eaten_at: string;
  photo_path: string | null;
  label: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  notes: string | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type Mode = "display" | "edit" | "refine";

export default function FoodEntryCard({ entry }: { entry: FoodEntry }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("display");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // edit-mode form state
  const [label, setLabel] = useState(entry.label ?? "");
  const [calories, setCalories] = useState(String(entry.calories ?? ""));
  const [protein, setProtein] = useState(String(entry.protein_g ?? ""));
  const [carbs, setCarbs] = useState(String(entry.carbs_g ?? ""));
  const [fat, setFat] = useState(String(entry.fat_g ?? ""));
  const [sugar, setSugar] = useState(String(entry.sugar_g ?? ""));

  // refine-mode state
  const [note, setNote] = useState("");

  function resetForm() {
    setLabel(entry.label ?? "");
    setCalories(String(entry.calories ?? ""));
    setProtein(String(entry.protein_g ?? ""));
    setCarbs(String(entry.carbs_g ?? ""));
    setFat(String(entry.fat_g ?? ""));
    setSugar(String(entry.sugar_g ?? ""));
    setNote("");
    setErr(null);
  }

  async function saveManual() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("food_entries")
      .update({
        label: label || null,
        calories: calories ? Math.round(Number(calories)) : null,
        protein_g: protein ? Number(protein) : null,
        carbs_g: carbs ? Number(carbs) : null,
        fat_g: fat ? Number(fat) : null,
        sugar_g: sugar ? Number(sugar) : null,
      })
      .eq("id", entry.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMode("display");
    router.refresh();
  }

  async function refineWithAI() {
    if (!note.trim()) {
      setErr("Tell Claude what's different.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/refine-food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entry.id, userNote: note.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr("Refine failed: " + (j.error ?? res.statusText));
      return;
    }
    setMode("display");
    setNote("");
    router.refresh();
  }

  async function deleteEntry() {
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("food_entries").delete().eq("id", entry.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <article className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
      <div className="flex gap-3">
        {entry.photo_path && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/food-thumb?path=${encodeURIComponent(entry.photo_path)}`}
            alt={entry.label ?? "Food"}
            className="w-20 h-20 rounded-lg object-cover bg-neutral-100 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {mode === "display" && (
            <>
              <div className="flex justify-between items-baseline gap-2">
                <h3 className="font-medium truncate">{entry.label}</h3>
                <span className="text-xs text-neutral-500 flex-shrink-0">
                  {fmtTime(entry.eaten_at)}
                </span>
              </div>
              <div className="text-sm">
                <strong>{entry.calories ?? 0} kcal</strong>
                <span className="text-neutral-500">
                  {" "}· P {Number(entry.protein_g ?? 0).toFixed(0)}g · C{" "}
                  {Number(entry.carbs_g ?? 0).toFixed(0)}g · F{" "}
                  {Number(entry.fat_g ?? 0).toFixed(0)}g
                  {entry.sugar_g != null && (
                    <> · S {Number(entry.sugar_g).toFixed(0)}g</>
                  )}
                </span>
              </div>
              {entry.notes && (
                <p className="text-xs text-neutral-500 line-clamp-2">{entry.notes}</p>
              )}
            </>
          )}

          {mode === "edit" && (
            <div className="space-y-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label"
                className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-sm"
              />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <label className="text-xs text-neutral-500">
                  kcal
                  <input
                    type="number"
                    inputMode="numeric"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="block w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  protein (g)
                  <input
                    type="number"
                    inputMode="decimal"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    className="block w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  carbs (g)
                  <input
                    type="number"
                    inputMode="decimal"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    className="block w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  fat (g)
                  <input
                    type="number"
                    inputMode="decimal"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="block w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  sugar (g)
                  <input
                    type="number"
                    inputMode="decimal"
                    value={sugar}
                    onChange={(e) => setSugar(e.target.value)}
                    className="block w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>
          )}

          {mode === "refine" && (
            <div className="space-y-2">
              <div className="text-sm">
                <strong>{entry.label}</strong>
                <span className="text-neutral-500"> · {entry.calories ?? 0} kcal</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder='e.g. "I only ate 4 slices, not the whole pizza"'
                rows={2}
                className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-sm"
              />
            </div>
          )}

          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        </div>
      </div>

      <div className="mt-3 flex gap-2 flex-wrap text-xs">
        {mode === "display" && (
          <>
            <button
              onClick={() => setMode("refine")}
              disabled={busy || !entry.photo_path}
              className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
              title={entry.photo_path ? "Tell Claude what's different" : "No photo to re-analyze"}
            >
              ↻ Tell Claude
            </button>
            <button
              onClick={() => setMode("edit")}
              disabled={busy}
              className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              ✎ Edit
            </button>
            <button
              onClick={deleteEntry}
              disabled={busy}
              className="ml-auto px-3 py-1 rounded text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              Delete
            </button>
          </>
        )}
        {mode === "edit" && (
          <>
            <button
              onClick={saveManual}
              disabled={busy}
              className="px-3 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                resetForm();
                setMode("display");
              }}
              disabled={busy}
              className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700"
            >
              Cancel
            </button>
          </>
        )}
        {mode === "refine" && (
          <>
            <button
              onClick={refineWithAI}
              disabled={busy || !note.trim()}
              className="px-3 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Re-analyzing…" : "Re-analyze"}
            </button>
            <button
              onClick={() => {
                resetForm();
                setMode("display");
              }}
              disabled={busy}
              className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </article>
  );
}
