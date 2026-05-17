"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DAY_LABELS_LONG, type Exercise, type PlanDay } from "@/lib/plan";

export default function PlanDayCard({
  day,
  isToday,
}: {
  day: PlanDay;
  isToday: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [focus, setFocus] = useState(day.focus ?? "");
  const [isRest, setIsRest] = useState(day.is_rest_day);
  const [exercises, setExercises] = useState<Exercise[]>(day.exercises);

  function addExercise() {
    setExercises([
      ...exercises,
      { name: "", sets: null, reps: "", weight: "", notes: "" },
    ]);
  }
  function updateExercise(i: number, patch: Partial<Exercise>) {
    setExercises(exercises.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function removeExercise(i: number) {
    setExercises(exercises.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not logged in");
      setBusy(false);
      return;
    }
    const cleanExercises = exercises
      .filter((e) => e.name.trim().length > 0)
      .map((e) => ({
        name: e.name.trim(),
        sets: e.sets != null && Number(e.sets) > 0 ? Math.round(Number(e.sets)) : null,
        reps: e.reps?.trim() || null,
        weight: e.weight?.trim() || null,
        notes: e.notes?.trim() || null,
      }));

    const { error } = await supabase.from("workout_plan").upsert(
      {
        user_id: user.id,
        day_of_week: day.day_of_week,
        focus: isRest ? null : focus.trim() || null,
        is_rest_day: isRest,
        exercises: isRest ? [] : cleanExercises,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,day_of_week" },
    );
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setFocus(day.focus ?? "");
    setIsRest(day.is_rest_day);
    setExercises(day.exercises);
    setErr(null);
    setEditing(false);
  }

  return (
    <article
      className={`rounded-2xl border p-4 ${
        isToday
          ? "border-brand-500 ring-1 ring-brand-500/50 bg-brand-50 dark:bg-brand-700/10"
          : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">
          {DAY_LABELS_LONG[day.day_of_week]}
          {isToday && (
            <span className="ml-2 text-xs font-medium text-brand-600">Today</span>
          )}
        </h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✎ Edit
          </button>
        )}
      </div>

      {!editing && (
        <>
          {day.is_rest_day ? (
            <p className="text-sm text-neutral-500">Rest day</p>
          ) : day.focus || day.exercises.length > 0 ? (
            <>
              {day.focus && (
                <p className="text-sm font-medium text-brand-600">{day.focus}</p>
              )}
              {day.exercises.length > 0 && (
                <ul className="mt-1 text-sm space-y-0.5">
                  {day.exercises.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.name}</span>
                      {(e.sets || e.reps) && (
                        <span className="text-neutral-500">
                          {" — "}
                          {e.sets ? `${e.sets}×` : ""}
                          {e.reps ?? ""}
                        </span>
                      )}
                      {e.weight && (
                        <span className="text-brand-600 font-medium"> @ {e.weight}</span>
                      )}
                      {e.notes && (
                        <span className="text-xs text-neutral-500"> · {e.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500 italic">Nothing planned yet</p>
          )}
        </>
      )}

      {editing && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRest}
              onChange={(e) => setIsRest(e.target.checked)}
            />
            Rest day
          </label>

          {!isRest && (
            <>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Focus (e.g. Push, Legs, Cardio)"
                className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />

              <div className="space-y-2">
                {exercises.map((ex, i) => (
                  <div
                    key={i}
                    className="rounded border border-neutral-200 dark:border-neutral-800 p-2 space-y-1"
                  >
                    <div className="flex gap-2">
                      <input
                        value={ex.name}
                        onChange={(e) => updateExercise(i, { name: e.target.value })}
                        placeholder="Exercise name"
                        className="flex-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => removeExercise(i)}
                        className="text-xs text-neutral-500 hover:text-red-600 px-2"
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={ex.sets ?? ""}
                        onChange={(e) =>
                          updateExercise(i, {
                            sets: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        placeholder="sets"
                        className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                      />
                      <input
                        value={ex.reps ?? ""}
                        onChange={(e) => updateExercise(i, { reps: e.target.value })}
                        placeholder="reps (8-10)"
                        className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                      />
                      <input
                        value={ex.weight ?? ""}
                        onChange={(e) => updateExercise(i, { weight: e.target.value })}
                        placeholder="weight (e.g. 135 lb)"
                        className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                      />
                      <input
                        value={ex.notes ?? ""}
                        onChange={(e) => updateExercise(i, { notes: e.target.value })}
                        placeholder="notes"
                        className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                ))}
                <button
                  onClick={addExercise}
                  type="button"
                  className="w-full text-sm rounded border border-dashed border-neutral-300 dark:border-neutral-700 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  + Add exercise
                </button>
              </div>
            </>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="px-3 py-1 rounded bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancel}
              disabled={busy}
              className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
