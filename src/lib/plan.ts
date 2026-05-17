export type Exercise = {
  name: string;
  sets?: number | null;
  reps?: string | null;
  weight?: string | null;   // free-text, e.g. "135 lb", "20 kg dumbbells", "bodyweight"
  notes?: string | null;
};

export type PlanDay = {
  day_of_week: number; // 0=Mon..6=Sun
  focus: string | null;
  is_rest_day: boolean;
  exercises: Exercise[];
};

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_LABELS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** JS Date.getDay(): 0=Sun..6=Sat. Convert to our 0=Mon..6=Sun. */
export function todayDayOfWeek(): number {
  const dow = new Date().getDay();
  return dow === 0 ? 6 : dow - 1;
}

export function emptyPlan(): PlanDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    focus: null,
    is_rest_day: false,
    exercises: [],
  }));
}

/** Merge a list of DB rows with empties so we always have 7 days in order. */
export function fillPlan(
  rows: { day_of_week: number; focus: string | null; is_rest_day: boolean; exercises: unknown }[],
): PlanDay[] {
  const map = new Map<number, PlanDay>();
  for (const r of rows) {
    map.set(r.day_of_week, {
      day_of_week: r.day_of_week,
      focus: r.focus,
      is_rest_day: r.is_rest_day,
      exercises: Array.isArray(r.exercises) ? (r.exercises as Exercise[]) : [],
    });
  }
  return emptyPlan().map((d) => map.get(d.day_of_week) ?? d);
}
