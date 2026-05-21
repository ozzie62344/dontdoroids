"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayStr } from "@/lib/dates";

const MAX_EDGE = 1536; // longest-side cap before upload
const JPEG_QUALITY = 0.85;

async function resizeImage(file: File): Promise<Blob> {
  // Read the file into an HTMLImageElement so we can draw it to a canvas.
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // some HEIC files refuse — fall back to original

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export default function FoodUploader({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eatenDate, setEatenDate] = useState<string>(todayStr());

  async function handleFile(file: File) {
    setBusy(true);
    setStatus("Preparing photo…");
    const supabase = createClient();

    const resized = await resizeImage(file);
    const path = `${userId}/${crypto.randomUUID()}.jpg`;

    setStatus(`Uploading… (${Math.round(resized.size / 1024)} KB)`);
    const { error: upErr } = await supabase.storage
      .from("food-photos")
      .upload(path, resized, { contentType: "image/jpeg", upsert: false });

    if (upErr) {
      setStatus("Upload failed: " + upErr.message);
      setBusy(false);
      return;
    }

    setStatus("Analyzing with Claude…");
    const res = await fetch("/api/analyze-food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photoPath: path,
        eatenAt: eatenDate === todayStr() ? undefined : eatenDate,
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setStatus("Analyze failed: " + (j.error ?? res.statusText));
      setBusy(false);
      return;
    }

    const { estimate } = await res.json();
    setStatus(
      `Logged ${estimate.label} — ${estimate.calories} kcal (${estimate.confidence} confidence)`,
    );
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center space-y-3">
      <p className="text-sm text-neutral-500">
        Snap or pick a photo of your meal. Claude will estimate calories + macros.
      </p>
      <div className="flex items-center justify-center gap-2 text-sm">
        <label className="text-neutral-500">Date</label>
        <input
          type="date"
          value={eatenDate}
          max={todayStr()}
          onChange={(e) => setEatenDate(e.target.value || todayStr())}
          disabled={busy}
          className="rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
        />
      </div>
      <label className="inline-block">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="sr-only"
        />
        <span
          className={`inline-flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-5 py-3 ${busy ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}
        >
          {busy ? "Working…" : "📷 Take / pick photo"}
        </span>
      </label>
      {status && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{status}</p>
      )}
    </div>
  );
}
