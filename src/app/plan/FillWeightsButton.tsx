"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FillWeightsButton() {
  const router = useRouter();
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fill() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/fill-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setMsg(`Weights filled in ${unit}.`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-lg border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setUnit("lb")}
          className={`px-3 py-1 ${unit === "lb" ? "bg-brand-600 text-white" : ""}`}
        >
          lb
        </button>
        <button
          type="button"
          onClick={() => setUnit("kg")}
          className={`px-3 py-1 ${unit === "kg" ? "bg-brand-600 text-white" : ""}`}
        >
          kg
        </button>
      </div>
      <button
        onClick={fill}
        disabled={busy}
        className="rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60 text-sm font-medium px-3 py-2"
      >
        {busy ? "Filling…" : "🏋 Fill in weights"}
      </button>
      {msg && <span className="text-xs text-green-600">{msg}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
