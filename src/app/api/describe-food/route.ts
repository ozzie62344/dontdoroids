import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a nutrition estimator. The user types a short description of food they ate (e.g. "4 eggs", "bowl of oatmeal with banana", "two slices of cheese pizza", "footlong turkey sub from Subway").

Respond with ONE JSON object only (no markdown, no commentary) matching this schema:

{
  "label": string,            // short name, e.g. "4 scrambled eggs"
  "calories": integer,        // best whole-meal estimate
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "sugar_g": number,           // added + naturally occurring sugars (subset of carbs)
  "confidence": "low"|"medium"|"high",
  "notes": string              // brief reasoning, portion / preparation assumptions
}

If preparation isn't specified, assume the typical preparation (e.g. eggs → scrambled with a little butter) and mention it in notes.
sugar_g should be the sugar portion of carbs (e.g. a soda is mostly sugar; a chicken breast has ~0g).
If the description is too vague to estimate (e.g. just "food"), set calories to 0 and explain in notes.`;

type FoodEstimate = {
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  confidence: "low" | "medium" | "high";
  notes: string;
};

function parseEstimate(text: string): FoodEstimate {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const obj = JSON.parse(cleaned);
  return {
    label: String(obj.label ?? "Unknown food"),
    calories: Math.max(0, Math.round(Number(obj.calories) || 0)),
    protein_g: Math.max(0, Number(obj.protein_g) || 0),
    carbs_g: Math.max(0, Number(obj.carbs_g) || 0),
    fat_g: Math.max(0, Number(obj.fat_g) || 0),
    sugar_g: Math.max(0, Number(obj.sugar_g) || 0),
    confidence: ["low", "medium", "high"].includes(obj.confidence) ? obj.confidence : "low",
    notes: String(obj.notes ?? "").slice(0, 500),
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on the server." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const description = (body?.description as string | undefined)?.trim();
  if (!description) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }
  if (description.length > 500) {
    return NextResponse.json({ error: "Description too long (500 chars max)" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let estimate: FoodEstimate;
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `User ate: ${description}\n\nReturn the JSON estimate.`,
        },
      ],
    });
    const textBlock = msg.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");
    estimate = parseEstimate(textBlock.text);
  } catch (err) {
    console.error("Claude describe-food error:", err);
    return NextResponse.json(
      { error: "Could not estimate. Try rephrasing." },
      { status: 502 },
    );
  }

  const { data: entry, error: insertErr } = await supabase
    .from("food_entries")
    .insert({
      user_id: user.id,
      photo_path: null,
      label: estimate.label,
      calories: estimate.calories,
      protein_g: estimate.protein_g,
      carbs_g: estimate.carbs_g,
      fat_g: estimate.fat_g,
      sugar_g: estimate.sugar_g,
      notes: estimate.notes,
      ai_raw: { ...(estimate as unknown as Record<string, unknown>), user_description: description },
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ entry, estimate });
}
