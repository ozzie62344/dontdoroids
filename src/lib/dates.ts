// Local-date helpers (no time component, no timezone weirdness).

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toLocalDateStr(new Date());
}

export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return toLocalDateStr(d);
}

/** Computes current and longest streak. days = set of YYYY-MM-DD strings the user worked out. */
export function computeStreaks(days: Set<string>): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };

  let current = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Current streak: walk backward from today; if today wasn't a workout day,
  // we still allow yesterday to start the streak (so the user doesn't lose it
  // mid-afternoon before they've logged today's session).
  let cursor = new Date(today);
  if (!days.has(toLocalDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(toLocalDateStr(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest: scan all days.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const s of sorted) {
    const d = new Date(s + "T00:00:00");
    if (prev) {
      const diff = (d.getTime() - prev.getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  return { current, longest };
}
