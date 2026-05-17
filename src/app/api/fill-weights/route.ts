import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { Exercise, PlanDay } from "@/lib/plan";
import { fillPlan } from "@/lib/plan";
import { loadBodyContext, WEIGHT_SCALING_RULES } from "@/lib/bodyContext";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are filling in weight recommendations on a user's existing weekly workout plan.

YOUR ONLY JOB is to add or replace the "weight" field on each exercise. You MUST NOT:
- Change exercise names
- Change sets or reps
- Change focus or is_rest_day
- Add or remove exercises
- Add or remove days

Output ONE JSON array (no markdown, no commentary) with the same structure as the input. Every exercise must have a "weight" field, using the user's chosen unit.

${WEIGHT_SCALING_RULES}`;

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
  // Optional override — if user says "I'm intermediate" we pass it; default unspecified.
  const experience =
    typeof body?.experience === "string" && body.experience.trim()
      ? body.experience.trim()
      : "(unspecified — assume intermediate)";

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

  const body_ctx = await loadBodyContext(supabase, user.id, unit);
  if (!body_ctx.hasBodyweight) {
    return NextResponse.json(
      {
        error:
          "Log your current weight under Body first — without it, Claude can't size the weights to you.",
      },
      { status: 400 },
    );
  }

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
    `${body_ctx.bodyweightLine}\n` +
    `${body_ctx.heightLine}\n` +
    `Experience: ${experience}\n` +
    `Preferred weight unit: ${unit}\n\n` +
    `Return the same 7-day JSON array with a "weight" field added to every exercise — calculated from the user's bodyweight using the scaling table (do not output stereotypical gym numbers). Do NOT change exercise names, sets, reps, focus, or notes.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rawText = "";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.2,
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
    parsed = plan.map((orig) => byDay.get(orig.day_of_week) ?? orig);
  } catch (err) {
    console.error("Parse failed. Raw:", rawText);
    const detail = err instanceof Error ? err.message : "parse error";
    return NextResponse.json(
      { error: `Could not parse Claude's response: ${detail}`, debug: rawText.slice(0, 800) },
      { status: 502 },
    );
  }

  // Only persist weight changes — preserve original names/sets/reps/notes/focus.
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
