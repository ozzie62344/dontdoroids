import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect from Supabase auth emails (email confirmation, password
// reset, magic link, OAuth). Exchanges the ?code= for a session cookie, then
// forwards to ?next= (default /dashboard).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("Auth callback exchange failed:", error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
