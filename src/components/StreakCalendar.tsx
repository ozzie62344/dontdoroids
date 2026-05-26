import { addDaysStr, todayStr } from "@/lib/dates";

export default function StreakCalendar({ days }: { days: Set<string> }) {
  // 7 columns (days of week) x 13 weeks ≈ ~3 months back.
  const cells: { date: string; done: boolean; isToday: boolean }[] = [];
  const today = todayStr();
  const total = 13 * 7;
  for (let i = total - 1; i >= 0; i--) {
    const ds = addDaysStr(today, -i);
    cells.push({ date: ds, done: days.has(ds), isToday: i === 0 });
  }

  return (
    <div className="flex flex-wrap gap-1">
      {cells.map((c) => (
        <div
          key={c.date}
          title={`${c.date}${c.done ? " ✓" : ""}`}
          className={[
            "h-4 w-4 rounded-sm",
            c.done ? "bg-brand-500" : "bg-neutral-200 dark:bg-neutral-800",
            c.isToday ? "ring-2 ring-brand-700" : "",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
