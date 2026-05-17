import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

// Allow this route up to 60s on Vercel (Pro). On Hobby it's ignored — see note below.
export const maxDuration = 60;

// Haiku 4.5 is fast + cheap and easily handles a 7-day plan in JSON.
const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a strength + conditioning coach building a 7-day weekly workout plan.

You will receive: goal, experience level, training days per week, equipment, preferred weight unit (lb or kg), the user's current bodyweight (if known), and free-form notes.

Output ONE JSON array (no markdown, no commentary) of exactly 7 objects, one per weekday in Monday..Sunday order. Day indices: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun.

Each object:
{
  "day_of_week": 0,                    // 0..6, must match position
  "focus": "Push" | null,              // 1-3 words; null only if is_rest_day true
  "is_rest_day": false,
  "exercises": [                       // empty array if rest day
    { "name": "Bench press", "sets": 4, "reps": "6-8", "weight": "135 lb", "notes": "RPE 8" }
  ]
}

Rules:
- Use EXACTLY the number of training days requested; the rest are rest days. Honor user notes about which specific day(s) to rest.
- 4-7 exercises per training day. Compound first, isolation later.
- Pick exercises that fit the equipment list.
- ALWAYS include a "weight" field, using the user's chosen unit (lb or kg):
  * Beginner: conservative starting weights
  * Intermediate: typical working weights
  * Advanced: heavier working weights
  * Sanity-check against bodyweight (beginner bench ≈ 0.5–0.75× bodyweight, etc.)
  * Bodyweight moves: "bodyweight" or "BW + 25 lb"
  * Cardio/holds where loaded weight doesn't apply: "—"
- "reps" string examples: "8-10", "AMRAP", "30s".
- "notes" short or empty.
- Respect injury/time constraints from notes (e.g. "1 hour sessions" → keep volume modest).`;

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
  // Strip code fences and find the first '[' .. last ']' so a trailing comment
  // or chatty preamble doesn't break JSON.parse.
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

  const userMsg =
    `Goal: ${goal}\n` +
    `Experience: ${experience}\n` +
    `Training days per week: ${daysPerWeek}\n` +
    `Equipment: ${equipment.join(", ") || "unspecified"}\n` +
    `Preferred weight unit: ${unit}\n` +
    `User bodyweight: ${bodyweightStr}\n` +
    (notes ? `Notes: ${notes}\n` : "") +
    `\nReturn the JSON array (7 days, Mon..Sun). Every exercise must include "weight" in ${unit} (or "bodyweight" / "—" where loaded weight doesn't apply).`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rawText = "";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMsg },
        // Prefill the assistant turn with "[" to force JSON-array output and
        // stop Claude from preamble-ing.
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
    // Because we prefilled "[", the response starts mid-array — re-prepend it.
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
