import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { loadBodyContext, WEIGHT_SCALING_RULES } from "@/lib/bodyContext";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a strength + conditioning coach building a 7-day weekly workout plan.

Output ONE JSON array (no markdown, no commentary) of exactly 7 objects, one per weekday in Monday..Sunday order. Day indices: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun.

Each object:
{
  "day_of_week": 0,
  "focus": "Push" | null,              // 1-3 words; null only if is_rest_day true
  "is_rest_day": false,
  "exercises": [
    { "name": "Bench press", "sets": 4, "reps": "6-8", "weight": "135 lb", "notes": "RPE 8" }
  ]
}

STRUCTURE RULES:
- Use EXACTLY the requested number of training days; the rest are rest days. Honor user notes about which specific day(s) to rest.
- 4-7 exercises per training day. Compound first, isolation later.
- Pick exercises that fit the equipment list.
- "reps" string examples: "8-10", "AMRAP", "30s".
- "notes" short or empty.
- Respect injury/time constraints from notes.

${WEIGHT_SCALING_RULES}`;

type Exercise = {
  name: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  notes: string | null;
};
type PlanDayPayload = {
  day_of_week: number;
  focus: string | null;
  is_rest_day: boolean;
  exercises: Exercise[];
};

function extractJsonArray(text: string): string {
  const stripped = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in model response");
  }
  return stripped.slice(start, end + 1);
}

function parsePlan(text: string): PlanDayPayload[] {
  const arr = JSON.parse(extractJsonArray(text));
  if (!Array.isArray(arr)) throw new Error("Top-level value is not an array");
  const days: PlanDayPayload[] = [];
  for (let i = 0; i < 7; i++) {
    const raw = arr.find((d) => Number(d?.day_of_week) === i) ?? arr[i];
    if (!raw) throw new Error(`Missing day ${i}`);
    const isRest = Boolean(raw.is_rest_day);
    const exsIn = Array.isArray(raw.exercises) ? raw.exercises : [];
    const exs: Exercise[] = isRest
      ? []
      : exsIn
          .map(
            (e: {
              name?: unknown;
              sets?: unknown;
              reps?: unknown;
              weight?: unknown;
              notes?: unknown;
            }) => ({
              name: String(e?.name ?? "").trim().slice(0, 80),
              sets:
                e?.sets != null && Number.isFinite(Number(e.sets))
                  ? Math.max(0, Math.round(Number(e.sets)))
                  : null,
              reps: e?.reps != null ? String(e.reps).slice(0, 30) : null,
              weight: e?.weight != null ? String(e.weight).slice(0, 30) : null,
              notes: e?.notes != null ? String(e.notes).slice(0, 200) : null,
            }),
          )
          .filter((e: Exercise) => e.name.length > 0);
    days.push({
      day_of_week: i,
      focus: isRest ? null : raw.focus ? String(raw.focus).slice(0, 60) : null,
      is_rest_day: isRest,
      exercises: exs,
    });
  }
  return days;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const goal = String(body?.goal ?? "").trim();
  const experience = String(body?.experience ?? "").trim();
  const daysPerWeek = Math.max(1, Math.min(7, Math.round(Number(body?.daysPerWeek) || 3)));
  const equipment: string[] = Array.isArray(body?.equipment) ? body.equipment.map(String) : [];
  const notes = String(body?.notes ?? "").trim().slice(0, 500);
  const unit: "lb" | "kg" = body?.unit === "kg" ? "kg" : "lb";

  if (!goal || !experience) {
    return NextResponse.json({ error: "Goal and experience required" }, { status: 400 });
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

  const userMsg =
    `Goal: ${goal}\n` +
    `Experience: ${experience}\n` +
    `Training days per week: ${daysPerWeek}\n` +
    `Equipment: ${equipment.join(", ") || "unspecified"}\n` +
    `Preferred weight unit: ${unit}\n` +
    `${body_ctx.bodyweightLine}\n` +
    `${body_ctx.heightLine}\n` +
    (notes ? `Notes: ${notes}\n` : "") +
    `\nReturn the JSON array (7 days, Mon..Sun). Every exercise must include "weight" in ${unit}. ` +
    `For each compound lift, you MUST compute the weight from the user's bodyweight using the scaling table — do not output stereotypical gym numbers.`;

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
      return NextResponse.json(
        { error: "Model returned no text content" },
        { status: 502 },
      );
    }
    rawText = "[" + textBlock.text;
  } catch (err) {
    console.error("Claude generate-plan API call failed:", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Anthropic API error: ${detail}` },
      { status: 502 },
    );
  }

  try {
    const plan = parsePlan(rawText);
    return NextResponse.json({ plan });
  } catch (err) {
    console.error("Plan parse failed. Raw text was:", rawText);
    const detail = err instanceof Error ? err.message : "parse error";
    return NextResponse.json(
      {
        error: `Could not parse plan: ${detail}`,
        debug: rawText.slice(0, 800),
      },
      { status: 502 },
    );
  }
}
