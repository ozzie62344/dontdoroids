import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GoalsForm from "@/components/GoalsForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("user_goals")
    .select("onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.onboarding_completed_at) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-2xl p-4 py-8">
      <GoalsForm
        mode="onboarding"
        initial={{
          daily_calorie_goal: null,
          daily_protein_g_goal: null,
          weekly_workout_goal: null,
          goal_weight_kg: null,
        }}
      />
    </main>
  );
}
