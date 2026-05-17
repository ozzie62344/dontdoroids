"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlanDay } from "@/lib/plan";

const GOALS = [
  { value: "build muscle / hypertrophy", label: "Build muscle" },
  { value: "lose fat", label: "Lose fat" },
  { value: "build strength", label: "Strength" },
  { value: "general fitness", label: "General fitness" },
] as const;

const EXPERIENCE = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

const EQUIPMENT = [
  "Barbell",
  "Dumbbells",
  "Machines / cables",
  "Pull-up bar",
  "Bodyweight only",
] as const;

export default function GeneratePlanModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [goal, setGoal] = useState(GOALS[0].value);
  const [experience, setExperience] = useState(EXPERIENCE[0].value);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [equipment, setEquipment] = useState<string[]>(["Dumbbells", "Bodyweight only"]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlanDay[] | null>(null);

  function toggleEquipment(item: string) {
    setEquipment((eq) =>
      eq.includes(item) ? eq.filter((e) => e !== item) : [...eq, item],
    );
  }

  async function generate() {
    setBusy(true);
    setErr(null);
    setPreview(null);
    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, experience, daysPerWeek, equipment, notes }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? res.statusText);
      }
      const { plan } = await res.json();
      setPreview(plan);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  }

  async function applyPlan() {
    if (!preview) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not logged in");
      setBusy(false);
      return;
    }
    const rows = preview.map((d) => ({
      user_id: user.id,
      day_of_week: d.day_of_week,
      focus: d.focus,
      is_rest_day: d.is_rest_day,
      exercises: d.exercises,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("workout_plan")
      .upsert(rows, { onConflict: "user_id,day_of_week" });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 overflow-y-auto">
      <div className="w-full max-w-2xl my-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 space-y-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Generate weekly plan with Claude</h2>
            <p className="text-xs text-neutral-500">
              Tell Claude a bit about you. It writes a 7-day plan you can preview before saving.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!preview && (
          <>
            <label className="block text-sm">
              <span className="text-neutral-500">Goal</span>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
              >
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-neutral-500">Experience</span>
                <select
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
                >
                  {EXPERIENCE.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-neutral-500">Training days / week</span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm text-neutral-500 mb-1">Equipment available</legend>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleEquipment(item)}
                    className={`text-sm px-3 py-1 rounded-full border ${
                      equipment.includes(item)
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm">
              <span className="text-neutral-500">Anything else? (injuries, preferences)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder='e.g. "bad left knee — no jumping", "love deadlifts", "only have 45 min per session"'
                className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
              />
            </label>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium"
              >
                {busy ? "Generating…" : "Generate"}
              </button>
            </div>
          </>
        )}

        {preview && (
          <>
            <p className="text-sm text-neutral-500">
              Preview. Hit <strong>Apply</strong> to overwrite all 7 days. You can edit any day after.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {preview.map((d) => (
                <div
                  key={d.day_of_week}
                  className="rounded border border-neutral-200 dark:border-neutral-800 p-3 text-sm"
                >
                  <div className="font-semibold">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.day_of_week]}
                    {d.is_rest_day ? (
                      <span className="ml-2 text-neutral-500 font-normal">Rest</span>
                    ) : d.focus ? (
                      <span className="ml-2 text-brand-600 font-normal">{d.focus}</span>
                    ) : null}
                  </div>
                  {!d.is_rest_day && d.exercises.length > 0 && (
                    <ul className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {d.exercises.map((e, i) => (
                        <li key={i}>
                          • {e.name}
                          {e.sets || e.reps ? ` — ${e.sets ? e.sets + "×" : ""}${e.reps ?? ""}` : ""}
                          {e.notes ? ` (${e.notes})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}

            <div className="flex justify-between gap-2">
              <button
                onClick={() => setPreview(null)}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm"
              >
                ← Tweak inputs
              </button>
              <div className="flex gap-2">
                <button
                  onClick={generate}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm"
                >
                  ↻ Regenerate
                </button>
                <button
                  onClick={applyPlan}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium"
                >
                  {busy ? "Saving…" : "Apply"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
