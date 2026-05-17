"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayStr } from "@/lib/dates";

export default function WorkoutForm({ alreadyDoneToday }: { alreadyDoneToday: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not logged in");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("workouts").upsert(
      { user_id: user.id, day: todayStr(), kind: kind || null, notes: notes || null },
      { onConflict: "user_id,day" },
    );
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setKind("");
    setNotes("");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3">
      <h2 className="font-semibold">
        {alreadyDoneToday ? "Today’s workout logged" : "Did you work out today?"}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Type (optional)…</option>
          <option value="lift">Lift</option>
          <option value="cardio">Cardio</option>
          <option value="yoga">Yoga / mobility</option>
          <option value="sport">Sport</option>
          <option value="other">Other</option>
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="w-full sm:w-auto rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium px-4 py-2"
      >
        {busy ? "Saving…" : alreadyDoneToday ? "Update today" : "Mark workout done"}
      </button>
    </section>
  );
}
