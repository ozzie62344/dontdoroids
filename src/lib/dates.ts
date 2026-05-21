// Date helpers. All "today" / "week" computations are anchored to APP_TIMEZONE
// (not the server's local time or UTC) so that "today" resets at midnight Pacific
// for every user, regardless of where the Vercel server runs.
//
// Using America/Los_Angeles (handles PST/PDT automatically via DST).

export const APP_TIMEZONE = "America/Los_Angeles";

/** Format a Date as YYYY-MM-DD in APP_TIMEZONE. */
export function toLocalDateStr(d: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD natively.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayStr(): string {
  return toLocalDateStr(new Date());
}

/** Add n calendar days to a YYYY-MM-DD string (negative n = subtract). */
export function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** YYYY-MM-DD for n days ago in APP_TIMEZONE. */
export function daysAgoStr(n: number): string {
  return addDaysStr(todayStr(), -n);
}

/** Return the UTC Date that corresponds to midnight on `ymd` in APP_TIMEZONE. */
export function startOfDayUTC(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // What wall-clock does utcGuess read as in APP_TIMEZONE?
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  const part = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = part("hour") === 24 ? 0 : part("hour");
  const wallMs = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    hour,
    part("minute"),
    part("second"),
  );
  // offset = how far the tz wall trails utcGuess. Adding it shifts utcGuess so its
  // wall reading lands at midnight on ymd.
  const offset = utcGuess - wallMs;
  return new Date(utcGuess + offset);
}

/** ISO timestamp for the moment that "today" started in APP_TIMEZONE. */
export function startOfTodayISO(): string {
  return startOfDayUTC(todayStr()).toISOString();
}

/** Day-of-week for today in APP_TIMEZONE. 0=Sun..6=Sat (same as Date.getDay). */
export function todayDayOfWeekSun0(): number {
  const today = todayStr();
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Computes current and longest streak. days = set of YYYY-MM-DD strings the user worked out. */
export function computeStreaks(days: Set<string>): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };

  let current = 0;
  let cursor = todayStr();
  // If today wasn't a workout day, allow yesterday to start the streak (so the
  // user doesn't lose it mid-afternoon before they've logged today's session).
  if (!days.has(cursor)) {
    cursor = addDaysStr(cursor, -1);
  }
  while (days.has(cursor)) {
    current++;
    cursor = addDaysStr(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const s of sorted) {
    if (prev && addDaysStr(prev, 1) === s) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = s;
  }

  return { current, longest };
}
