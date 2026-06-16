import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseServerConfig } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function updateUrl(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/reset-password/update", request.url);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return NextResponse.redirect(
      updateUrl(request, { error: "missing-password" }),
      303
    );
  }

  if (!hasSupabaseServerConfig()) {
    return NextResponse.redirect(
      updateUrl(request, { error: "auth-not-configured" }),
      303
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.warn("Supabase password update failed", {
      code: error.code,
      message: error.message,
      status: error.status,
    });

    return NextResponse.redirect(
      updateUrl(request, { error: "update-failed" }),
      303
    );
  }

  await supabase.auth.signOut();

  return NextResponse.redirect(updateUrl(request, { updated: "1" }), 303);
}
