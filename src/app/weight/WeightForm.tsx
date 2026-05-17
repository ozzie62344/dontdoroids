"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayStr } from "@/lib/dates";

export default function WeightForm({ defaultHeightCm }: { defaultHeightCm: number | null }) {
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(defaultHeightCm ? String(defaultHeightCm) : "");
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!weight && !height) {
      setError("Enter at least weight or height.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not logged in");
      setBusy(false);
      return;
    }

    const weight_kg = weight
      ? unit === "metric"
        ? Number(weight)
        : Number(weight) * 0.45359237
      : null;
    const height_cm = height
      ? unit === "metric"
        ? Number(height)
        : Number(height) * 2.54
      : null;

    const { error } = await supabase.from("body_metrics").insert({
      user_id: user.id,
      measured_on: date,
      weight_kg,
      height_cm,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setWeight("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Log a measurement</h2>
        <div className="inline-flex rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setUnit("metric")}
            className={`px-2 py-1 ${unit === "metric" ? "bg-brand-600 text-white" : ""}`}
          >
            kg / cm
          </button>
          <button
            type="button"
            onClick={() => setUnit("imperial")}
            className={`px-2 py-1 ${unit === "imperial" ? "bg-brand-600 text-white" : ""}`}
          >
            lb / in
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="text-neutral-500">Date</span>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-neutral-500">Weight ({unit === "metric" ? "kg" : "lb"})</span>
          <input
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-neutral-500">Height ({unit === "metric" ? "cm" : "in"})</span>
          <input
            type="number"
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full sm:w-auto rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium px-4 py-2"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
