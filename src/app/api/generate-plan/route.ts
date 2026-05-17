import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a strength + conditioning coach building a 7-day weekly workout plan.

You will receive: goal, experience level, training days per week, equipment, preferred weight unit (lb or kg), the user's current bodyweight (if known), and free-form notes.

Output ONE JSON array (no markdown, no commentary) of exactly 7 objects, one per weekday in Monday..Sunday order:

[
  {
    "day_of_week": 0,                    // 0=Mon..6=Sun (must match index)
    "focus": "Push" | null,              // short label; null only if is_rest_day true
    "is_rest_day": false,
    "exercises": [                       // empty array if rest day
      {
        "name": "Bench press",
        "sets": 4,
        "reps": "6-8",
        "weight": "135 lb",              // ALWAYS include — use the user's unit
        "notes": "RPE 8"
      }
    ]
  },
  ...
]

Rules for the weekly structure:
- Use exactly the number of training days the user requested; fill the rest as rest days.
- Spread rest days sensibly (don't bunch them all on weekends if the user trains 3 days).
- Pick exercises that fit the user's equipment. Bodyweight-only users get push-ups, dips, pistol squats, etc. — no barbell.
- 4-7 exercises per training day. Compound first, isolation later.
- Keep "focus" to 1-3 words like "Push", "Pull", "Legs + core", "Conditioning".

Rules for "weight" (THIS IS IMPORTANT):
- Always provide a concrete recommendation, using the user's chosen unit (lb or kg).
- For loaded exercises, give a starting weight that suits the experience level:
  * Beginner: conservative starting weights they can do with good form
  * Intermediate: typical working weights
  * Advanced: higher working weights
- Use the user's bodyweight as a sanity check (e.g. beginner bench ≈ 0.5–0.75× bodyweight).
- For bodyweight exercises (push-ups, pull-ups, lunges, etc.): use "bodyweight" or "BW + 25 lb" for weighted variations.
- For cardio/holds/conditioning (planks, runs, intervals): weight is "—" (a single dash).
- Format examples: "135 lb", "60 kg", "20 lb dumbbells", "BW + 25 lb", "bodyweight", "—".
- "reps" is a string so you can use ranges ("8-10"), "AMRAP", "30s", etc.
- "notes" should be short or empty — RPE, tempo, or progression tips.
- Respect the user's constraints (injuries, preferences) from the notes field.`;

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

function parsePlan(text: string): PlanDayPayload[] {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw new Error("Expected array");
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

  // Look up the user's latest weight (kg) so Claude can recommend sensible loads.
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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let plan: PlanDayPayload[];
  try {
    const userMsg =
      `Goal: ${goal}\n` +
      `Experience: ${experience}\n` +
      `Training days per week: ${daysPerWeek}\n` +
      `Equipment: ${equipment.join(", ") || "unspecified"}\n` +
      `Preferred weight unit: ${unit}\n` +
      `User bodyweight: ${bodyweightStr}\n` +
      (notes ? `Notes: ${notes}\n` : "") +
      `\nReturn the 7-day JSON plan now. EVERY exercise must include a "weight" field in ${unit} (or "bodyweight" / "—" where loaded weight doesn't apply).`;
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });
    const textBlock = msg.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");
    plan = parsePlan(textBlock.text);
  } catch (err) {
    console.error("Claude plan error:", err);
    return NextResponse.json({ error: "Could not generate plan." }, { status: 502 });
  }

  return NextResponse.json({ plan });
}
