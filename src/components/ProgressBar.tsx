export default function ProgressBar({
  value,
  max,
  className = "",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const over = value > max;
  return (
    <div
      className={`h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`h-full ${over ? "bg-red-500" : "bg-brand-600"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
