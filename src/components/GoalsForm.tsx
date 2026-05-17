"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayStr } from "@/lib/dates";

type Unit = "metric" | "imperial";

export type GoalsFormInitial = {
  daily_calorie_goal: number | null;
  daily_protein_g_goal: number | null;
  weekly_workout_goal: number | null;
  goal_weight_kg: number | null;
};

function toKg(value: string, unit: Unit): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "metric" ? n : n * 0.45359237;
}

function toCm(value: string, unit: Unit): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === "metric" ? n : n * 2.54;
}

export default function GoalsForm({
  initial,
  mode,
}: {
  initial: GoalsFormInitial;
  mode: "onboarding" | "settings";
}) {
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>("metric");
  const [calories, setCalories] = useState(
    initial.daily_calorie_goal != null
      ? String(initial.daily_calorie_goal)
      : mode === "onboarding"
      ? "2000"
      : "",
  );
  const [protein, setProtein] = useState(
    initial.daily_protein_g_goal != null
      ? String(initial.daily_protein_g_goal)
      : mode === "onboarding"
      ? "150"
      : "",
  );
  const [workouts, setWorkouts] = useState(
    initial.weekly_workout_goal != null
      ? String(initial.weekly_workout_goal)
      : mode === "onboarding"
      ? "4"
      : "",
  );
  const [goalWeight, setGoalWeight] = useState(
    initial.goal_weight_kg != null ? String(Number(initial.goal_weight_kg).toFixed(1)) : "",
  );
  const [startWeight, setStartWeight] = useState("");
  const [startHeight, setStartHeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(opts: { skip: boolean }) {
    setBusy(true);
    setErr(null);
    setSavedMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not logged in");
      setBusy(false);
      return;
    }

    const cal = opts.skip || !calories ? null : Math.max(0, Math.round(Number(calories)));
    const pro = opts.skip || !protein ? null : Math.max(0, Number(protein));
    const wk = opts.skip || !workouts ? null : Math.max(0, Math.round(Number(workouts)));
    const gw = opts.skip ? null : toKg(goalWeight, unit);
    const sw = opts.skip ? null : toKg(startWeight, unit);
    const sh = opts.skip ? null : toCm(startHeight, unit);

    const { error: gErr } = await supabase.from("user_goals").upsert(
      {
        user_id: user.id,
        daily_calorie_goal: cal,
        daily_protein_g_goal: pro,
        weekly_workout_goal: wk,
        goal_weight_kg: gw,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (gErr) {
      setErr(gErr.message);
      setBusy(false);
      return;
    }

    if (mode === "onboarding" && (sw != null || sh != null)) {
      const { error: mErr } = await supabase.from("body_metrics").insert({
        user_id: user.id,
        measured_on: todayStr(),
        weight_kg: sw,
        height_cm: sh,
        notes: "Starting measurement (from onboarding)",
      });
      if (mErr) console.warn("Body metric insert failed:", mErr.message);
    }

    setBusy(false);
    if (mode === "onboarding") {
      router.push("/dashboard");
      router.refresh();
    } else {
      setSavedMsg("Saved.");
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save({ skip: false });
      }}
      className="space-y-5"
    >
      <header>
        <h1 className="text-2xl font-semibold">
          {mode === "onboarding" ? "Set your goals" : "Edit goals"}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {mode === "onboarding"
            ? "We’ll show progress against these on your dashboard. Tweak any time in Settings."
            : "Change any of these and hit Save."}
        </p>
      </header>

      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setUnit("metric")}
            className={`px-3 py-1 ${unit === "metric" ? "bg-brand-600 text-white" : ""}`}
          >
            kg / cm
          </button>
          <button
            type="button"
            onClick={() => setUnit("imperial")}
            className={`px-3 py-1 ${unit === "imperial" ? "bg-brand-600 text-white" : ""}`}
          >
            lb / in
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
        <h2 className="font-semibold">Daily nutrition</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-neutral-500">Calorie target (kcal)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">Protein target (g)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
        <h2 className="font-semibold">Workouts</h2>
        <label className="text-sm block">
          <span className="text-neutral-500">Target per week</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={14}
            value={workouts}
            onChange={(e) => setWorkouts(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
        <h2 className="font-semibold">Body {mode === "settings" ? "" : "(optional)"}</h2>
        {mode === "onboarding" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-neutral-500">
                Starting weight ({unit === "metric" ? "kg" : "lb"})
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={startWeight}
                onChange={(e) => setStartWeight(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-neutral-500">
                Height ({unit === "metric" ? "cm" : "in"})
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={startHeight}
                onChange={(e) => setStartHeight(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
              />
            </label>
          </div>
        )}
        <label className="text-sm block">
          <span className="text-neutral-500">
            Goal weight ({unit === "metric" ? "kg" : "lb"})
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={goalWeight}
            onChange={(e) => setGoalWeight(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        {mode === "onboarding" && (
          <p className="text-xs text-neutral-500">
            Starting weight + height get logged as your first body measurement.
          </p>
        )}
      </section>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {savedMsg && <p className="text-sm text-green-600">{savedMsg}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-3"
        >
          {busy ? "Saving…" : mode === "onboarding" ? "Save and continue" : "Save"}
        </button>
        {mode === "onboarding" && (
          <button
            type="button"
            onClick={() => void save({ skip: true })}
            disabled={busy}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-3 text-sm text-neutral-500"
          >
            Skip
          </button>
        )}
      </div>
    </form>
  );
}
