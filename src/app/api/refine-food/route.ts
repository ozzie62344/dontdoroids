import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a nutrition estimator. You previously estimated this meal from a photo,
and the user is now correcting you (e.g. portion size, missing/extra items, dish identity).

Re-estimate using BOTH the photo AND the user's correction. Trust the user's correction
about portion or content. Return ONE JSON object only (no markdown, no commentary):

{
  "label": string,
  "calories": integer,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "confidence": "low"|"medium"|"high",
  "notes": string
}`;

type FoodEstimate = {
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
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
    confidence: ["low", "medium", "high"].includes(obj.confidence) ? obj.confidence : "low",
    notes: String(obj.notes ?? "").slice(0, 500),
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
  const entryId = body?.entryId as string | undefined;
  const userNote = (body?.userNote as string | undefined)?.trim();
  if (!entryId || !userNote) {
    return NextResponse.json({ error: "entryId + userNote required" }, { status: 400 });
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("food_entries")
    .select("*")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .single();
  if (fetchErr || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (!entry.photo_path) {
    return NextResponse.json({ error: "Entry has no photo to re-analyze" }, { status: 400 });
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from("food-photos")
    .download(entry.photo_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: "Could not load photo" }, { status: 400 });
  }
  const arrayBuf = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString("base64");
  const mediaType = (blob.type || "image/jpeg") as
    | "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let estimate: FoodEstimate;
  try {
    const previous = JSON.stringify({
      label: entry.label,
      calories: entry.calories,
      protein_g: entry.protein_g,
      carbs_g: entry.carbs_g,
      fat_g: entry.fat_g,
    });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text:
                `Previous estimate: ${previous}\n\n` +
                `User correction: "${userNote}"\n\n` +
                `Return the corrected JSON.`,
            },
          ],
        },
      ],
    });
    const textBlock = msg.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");
    estimate = parseEstimate(textBlock.text);
  } catch (err) {
    console.error("Claude refine error:", err);
    return NextResponse.json({ error: "Could not re-analyze." }, { status: 502 });
  }

  const { data: updated, error: upErr } = await supabase
    .from("food_entries")
    .update({
      label: estimate.label,
      calories: estimate.calories,
      protein_g: estimate.protein_g,
      carbs_g: estimate.carbs_g,
      fat_g: estimate.fat_g,
      notes: estimate.notes,
      ai_raw: { ...(entry.ai_raw ?? {}), refinement: estimate, user_note: userNote },
    })
    .eq("id", entryId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ entry: updated, estimate });
}
