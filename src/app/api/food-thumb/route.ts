import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path || !path.startsWith(user.id + "/")) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from("food-photos")
    .createSignedUrl(path, 60 * 10);

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
