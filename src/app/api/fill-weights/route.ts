import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { Exercise, PlanDay } from "@/lib/plan";
import { fillPlan } from "@/lib/plan";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are filling in missing weight recommendations on a user's existing weekly workout plan.

You will receive: the user's existing 7-day plan as a JSON array (Monday=0..Sunday=6), the user's experience level if available, the user's bodyweight, and the preferred weight unit (lb or kg).

YOUR ONLY JOB is to add or update the "weight" field on each exercise. You MUST NOT:
- Change exercise names
- Change sets or reps
- Change focus or is_rest_day
- Add or remove exercises
- Add or remove days

Output ONE JSON array with the same structure. Every exercise must have a "weight" field, using the user's chosen unit:
- Loaded exercises: concrete numbers like "135 lb", "60 kg", "20 lb dumbbells"
- Bodyweight exercises: "bodyweight" or "BW + 25 lb"
- Cardio / holds / where loaded weight doesn't apply: "—" (a single dash)

Sanity-check against bodyweight (beginner bench ~0.5-0.75x bodyweight, etc.). Default to intermediate working weights if experience is unspecified.`;

function extractJsonArray(text: string): string {
  const stripped = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in model response");
  }
  return stripped.slice(start, end + 1);
}

type RawExercise = {
  name?: unknown;
  sets?: unknown;
  reps?: unknown;
  weight?: unknown;
  notes?: unknown;
};

function reshapeExercise(e: RawExercise): Exercise {
  return {
    name: String(e?.name ?? "").trim().slice(0, 80),
    sets:
      e?.sets != null && Number.isFinite(Number(e.sets))
        ? Math.max(0, Math.round(Number(e.sets)))
        : null,
    reps: e?.reps != null ? String(e.reps).slice(0, 30) : null,
    weight: e?.weight != null ? String(e.weight).slice(0, 30) : null,
    notes: e?.notes != null ? String(e.notes).slice(0, 200) : null,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const unit: "lb" | "kg" = body?.unit === "kg" ? "kg" : "lb";

  // Fetch the existing plan.
  const { data: rows } = await supabase
    .from("workout_plan")
    .select("day_of_week, focus, is_rest_day, exercises")
    .eq("user_id", user.id);

  const plan = fillPlan(rows ?? []);
  const nonEmpty = plan.some((d) => !d.is_rest_day && d.exercises.length > 0);
  if (!nonEmpty) {
    return NextResponse.json(
      { error: "No exercises in plan yet — add some first or use Generate." },
      { status: 400 },
    );
  }

  // Latest bodyweight for sane recommendations.
  const { data: latestWeight } = await supabase
    .from("body_metrics")
    .select("weight_kg")
    .eq("user_id", user.id)
    .not("weight_kg", "is", null)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  let bodyweightStr = "unknown";
  if (latestWeight?.weight_kg) {
    const kg = Number(latestWeight.weight_kg);
    bodyweightStr =
      unit === "kg" ? `${kg.toFixed(1)} kg` : `${(kg / 0.45359237).toFixed(1)} lb`;
  }

  // We send a slim version (no day_of_week — index encodes that).
  const slim = plan.map((d) => ({
    day_of_week: d.day_of_week,
    focus: d.focus,
    is_rest_day: d.is_rest_day,
    exercises: d.exercises.map((e) => ({
      name: e.name,
      sets: e.sets ?? null,
      reps: e.reps ?? null,
      notes: e.notes ?? null,
    })),
  }));

  const userMsg =
    `Existing plan:\n${JSON.stringify(slim, null, 2)}\n\n` +
    `User bodyweight: ${bodyweightStr}\n` +
    `Preferred weight unit: ${unit}\n\n` +
    `Return the same 7-day JSON array but with a "weight" field added to every exercise. Do not change names, sets, reps, or notes.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rawText = "";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMsg },
        { role: "assistant", content: "[" },
      ],
    });
    const textBlock = msg.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Model returned no text" }, { status: 502 });
    }
    rawText = "[" + textBlock.text;
  } catch (err) {
    console.error("Claude fill-weights call failed:", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: `Anthropic API error: ${detail}` }, { status: 502 });
  }

  let parsed: PlanDay[];
  try {
    const arr = JSON.parse(extractJsonArray(rawText));
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("Empty / invalid array");
    // Index by day_of_week so order doesn't matter.
    const byDay = new Map<number, PlanDay>();
    for (const raw of arr) {
      const idx = Number(raw?.day_of_week);
      if (!Number.isInteger(idx) || idx < 0 || idx > 6) continue;
      const exs = Array.isArray(raw.exercises)
        ? (raw.exercises as RawExercise[]).map(reshapeExercise).filter((e) => e.name.length > 0)
        : [];
      byDay.set(idx, {
        day_of_week: idx,
        focus: raw.focus != null ? String(raw.focus).slice(0, 60) : null,
        is_rest_day: Boolean(raw.is_rest_day),
        exercises: exs,
      });
    }
    // Merge: keep original days that Claude didn't return.
    parsed = plan.map((orig) => byDay.get(orig.day_of_week) ?? orig);
  } catch (err) {
    console.error("Parse failed. Raw:", rawText);
    const detail = err instanceof Error ? err.message : "parse error";
    return NextResponse.json(
      { error: `Could not parse Claude's response: ${detail}`, debug: rawText.slice(0, 800) },
      { status: 502 },
    );
  }

  // Safety net: only persist weight changes — if Claude tweaked an exercise name or
  // sets/reps, preserve the original values from the user's plan.
  const finalPlan: PlanDay[] = plan.map((orig) => {
    const fresh = parsed.find((p) => p.day_of_week === orig.day_of_week);
    if (!fresh) return orig;
    if (orig.is_rest_day || orig.exercises.length === 0) return orig;
    return {
      ...orig,
      exercises: orig.exercises.map((origEx, i) => {
        const freshEx = fresh.exercises[i];
        const newWeight = freshEx?.weight ?? null;
        return { ...origEx, weight: newWeight || origEx.weight || null };
      }),
    };
  });

  // Persist updated weights.
  const rowsToUpsert = finalPlan
    .filter((d) => !d.is_rest_day && d.exercises.length > 0)
    .map((d) => ({
      user_id: user.id,
      day_of_week: d.day_of_week,
      focus: d.focus,
      is_rest_day: d.is_rest_day,
      exercises: d.exercises,
      updated_at: new Date().toISOString(),
    }));

  if (rowsToUpsert.length > 0) {
    const { error } = await supabase
      .from("workout_plan")
      .upsert(rowsToUpsert, { onConflict: "user_id,day_of_week" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ plan: finalPlan });
}
