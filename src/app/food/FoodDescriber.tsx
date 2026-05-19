"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eatenAtForDate(ymd: string): string | undefined {
  if (!ymd || ymd === todayISODate()) return undefined;
  return new Date(`${ymd}T12:00:00`).toISOString();
}

export default function FoodDescriber() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [eatenDate, setEatenDate] = useState<string>(todayISODate());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = description.trim();
    if (!text) return;
    setBusy(true);
    setStatus("Estimating with Claude…");

    const res = await fetch("/api/describe-food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: text, eatenAt: eatenAtForDate(eatenDate) }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setStatus("Failed: " + (j.error ?? res.statusText));
      setBusy(false);
      return;
    }

    const { estimate } = await res.json();
    setStatus(
      `Logged ${estimate.label} — ${estimate.calories} kcal (${estimate.confidence} confidence)`,
    );
    setDescription("");
    setBusy(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-2"
    >
      <label className="block text-sm text-neutral-500">
        Or describe what you ate (no photo needed)
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          placeholder='e.g. "4 eggs" or "bowl of oatmeal with banana"'
          maxLength={500}
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !description.trim()}
          className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium px-4 py-2 text-sm"
        >
          {busy ? "Working…" : "Log"}
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <label>Date</label>
        <input
          type="date"
          value={eatenDate}
          max={todayISODate()}
          onChange={(e) => setEatenDate(e.target.value || todayISODate())}
          disabled={busy}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
        />
      </div>
      {status && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{status}</p>
      )}
    </form>
  );
}
