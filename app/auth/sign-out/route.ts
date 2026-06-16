import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseServerConfig } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (hasSupabaseServerConfig()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/", request.url), 303);
}
