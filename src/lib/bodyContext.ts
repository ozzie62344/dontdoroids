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

Every concrete weight you output for a compound lift MUST be calculated from the user's bodyweight using these working-weight multipliers (not 1RM — actual weight they'll do for the sets×reps prescribed):

                        BEGINNER       INTERMEDIATE   ADVANCED
Back Squat              0.50–0.80×BW   0.80–1.30×BW   1.30–1.80×BW
Front Squat             0.40–0.65×BW   0.65–1.05×BW   1.05–1.50×BW
Deadlift                0.65–1.05×BW   1.05–1.55×BW   1.55–2.20×BW
Romanian Deadlift       0.50–0.85×BW   0.85–1.30×BW   1.30–1.80×BW
Bench Press             0.40–0.65×BW   0.65–1.10×BW   1.10–1.55×BW
Incline Bench           0.35–0.55×BW   0.55–0.90×BW   0.90–1.30×BW
Overhead Press          0.25–0.45×BW   0.45–0.65×BW   0.65–0.90×BW
Barbell Row             0.40–0.65×BW   0.65–0.95×BW   0.95–1.30×BW
Hip Thrust              0.65–1.05×BW   1.05–1.65×BW   1.65–2.20×BW

CALCULATE THE NUMBER. Example: user bodyweight 123 lb, intermediate, Back Squat → 0.80 × 123 = 98 lb to 1.30 × 123 = 160 lb. Pick a value in that range and round to the nearest 5 lb (or 2.5 kg). Output "100 lb" or "115 lb", NOT "225 lb".

Isolation exercises (lateral raises, curls, tricep extensions, face pulls, calf raises, leg curls/extensions) use absolute dumbbell/cable weights that do NOT scale linearly with bodyweight. Reasonable starting numbers in lb (halve for kg):
  - Beginner: 5–15 lb dumbbells / light cable stack
  - Intermediate: 15–30 lb dumbbells / moderate stack
  - Advanced: 25–50+ lb dumbbells / heavy stack

Bodyweight movements (pull-ups, dips, push-ups, lunges, pistol squats): use "bodyweight" or "BW + 25 lb" if the user is advanced enough to add load.

Cardio, conditioning, planks, runs, intervals: weight is "—".

NEVER output a compound-lift weight that's higher than the user's bodyweight unless their experience level puts them above 1.0×BW for that lift per the table above. If you do, that's a critical error.`;
