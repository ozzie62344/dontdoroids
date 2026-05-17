import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import GoalsForm from "@/components/GoalsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("user_goals")
    .select(
      "daily_calorie_goal, daily_protein_g_goal, weekly_workout_goal, goal_weight_kg",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto max-w-2xl p-4 py-6">
        <GoalsForm
          mode="settings"
          initial={{
            daily_calorie_goal: row?.daily_calorie_goal ?? null,
            daily_protein_g_goal: row?.daily_protein_g_goal ?? null,
            weekly_workout_goal: row?.weekly_workout_goal ?? null,
            goal_weight_kg: row?.goal_weight_kg ?? null,
          }}
        />
      </main>
    </>
  );
}
