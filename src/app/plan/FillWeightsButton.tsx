"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Select from "@/components/Select";

const EXPERIENCE = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function FillWeightsButton() {
  const router = useRouter();
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [experience, setExperience] = useState("intermediate");
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
        body: JSON.stringify({ unit, experience }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setMsg(`Weights filled in ${unit} (${experience}).`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      <div className="w-36 text-sm">
        <Select value={experience} onChange={setExperience} options={EXPERIENCE} />
      </div>
      <button
        onClick={fill}
        disabled={busy}
        className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60 text-sm font-medium px-3 py-2"
      >
        {busy ? "Filling…" : "🏋 Fill in weights"}
      </button>
      {msg && <span className="text-xs text-green-600">{msg}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
