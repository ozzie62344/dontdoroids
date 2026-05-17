import type { SupabaseClient } from "@supabase/supabase-js";

/** Latest weight + height for a user, formatted in their chosen unit system. */
export type BodyContext = {
  bodyweightLine: string;             // "User bodyweight: 123 lb"
  heightLine: string;                 // "User height: 5'8\" (173 cm)"
  hasBodyweight: boolean;             // false → caller should error out
  weightLb: number | null;
};

export async function loadBodyContext(
  supabase: SupabaseClient,
  userId: string,
  unit: "lb" | "kg",
): Promise<BodyContext> {
  const { data: weightRow } = await supabase
    .from("body_metrics")
    .select("weight_kg, measured_on")
    .eq("user_id", userId)
    .not("weight_kg", "is", null)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: heightRow } = await supabase
    .from("body_metrics")
    .select("height_cm")
    .eq("user_id", userId)
    .not("height_cm", "is", null)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  let bodyweightLine = "User bodyweight: UNKNOWN (default to conservative beginner numbers and add a note asking the user to log their weight)";
  let weightLb: number | null = null;
  if (weightRow?.weight_kg) {
    const kg = Number(weightRow.weight_kg);
    const lb = kg / 0.45359237;
    weightLb = lb;
    bodyweightLine =
      unit === "kg"
        ? `User bodyweight: ${kg.toFixed(1)} kg`
        : `User bodyweight: ${lb.toFixed(1)} lb`;
  }

  let heightLine = "User height: unknown";
  if (heightRow?.height_cm) {
    const cm = Number(heightRow.height_cm);
    const totalIn = cm / 2.54;
    const ft = Math.floor(totalIn / 12);
    const inches = Math.round(totalIn - ft * 12);
    heightLine = `User height: ${ft}'${inches}" (${cm.toFixed(0)} cm)`;
  }

  return {
    bodyweightLine,
    heightLine,
    hasBodyweight: weightLb != null,
    weightLb,
  };
}

/** Strict weight-scaling guidance Claude must follow. */
export const WEIGHT_SCALING_RULES = `WEIGHT SCALING RULES (CRITICAL — follow these or the plan is useless):

These are CONSERVATIVE working-weight multipliers (not 1RM — the actual weight the user will do for the sets×reps prescribed). Intermediate centers around 0.65×BW for most lifts; advanced centers around 0.9×BW. Numbers OUTSIDE these ranges are forbidden.

                        BEGINNER       INTERMEDIATE   ADVANCED
Back Squat              0.30–0.55×BW   0.55–0.75×BW   0.75–1.00×BW
Front Squat             0.25–0.45×BW   0.45–0.65×BW   0.65–0.85×BW
Deadlift                0.40–0.60×BW   0.60–0.85×BW   0.85–1.20×BW
Romanian Deadlift       0.30–0.55×BW   0.55–0.75×BW   0.75–1.00×BW
Bench Press             0.25–0.45×BW   0.45–0.70×BW   0.70–0.95×BW
Incline Bench           0.20–0.40×BW   0.40–0.60×BW   0.60–0.85×BW
Overhead Press          0.20–0.35×BW   0.35–0.55×BW   0.55–0.75×BW
Barbell Row             0.30–0.50×BW   0.50–0.70×BW   0.70–0.95×BW
Hip Thrust              0.40–0.65×BW   0.65–0.95×BW   0.95–1.30×BW

CALCULATE THE NUMBER. Example: user bodyweight 123 lb, intermediate, Back Squat → 0.55 × 123 = 68 lb to 0.75 × 123 = 92 lb. Pick around the middle (~80 lb), round to the nearest 5 lb (or 2.5 kg). Output "80 lb", NOT "165 lb" and definitely NOT "225 lb".

Isolation exercises (lateral raises, curls, tricep extensions, face pulls, calf raises, leg curls/extensions) use absolute dumbbell/cable weights that do NOT scale linearly with bodyweight. Use the LOW end of these ranges for small users (under 140 lb):
  - Beginner: 5–10 lb dumbbells / light cable stack
  - Intermediate: 10–20 lb dumbbells / moderate stack
  - Advanced: 20–35 lb dumbbells / heavy stack

Bodyweight movements (pull-ups, dips, push-ups, lunges, pistol squats): use "bodyweight" or "BW + 10 lb" only if the user is advanced enough to add load.

Cardio, conditioning, planks, runs, intervals: weight is "—".

HARD CEILING: Intermediate compound-lift weight must NEVER exceed 0.75×bodyweight for upper-body or 0.85×bodyweight for lower-body. Advanced must NEVER exceed 1.0×bodyweight for upper-body or 1.2×bodyweight for lower-body. If you output a number above these ceilings, that is a critical error — recompute it.`;
