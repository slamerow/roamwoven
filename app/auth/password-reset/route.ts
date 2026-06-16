import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { hasSupabaseServerConfig } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function resetUrl(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/reset-password", request.url);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return NextResponse.redirect(
      resetUrl(request, { error: "missing-email" }),
      303
    );
  }

  if (!hasSupabaseServerConfig()) {
    return NextResponse.redirect(
      resetUrl(request, { error: "auth-not-configured" }),
      303
    );
  }

  const supabase = await createSupabaseServerClient();
  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("next", "/reset-password/update");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    console.warn("Supabase password reset failed", {
      code: error.code,
      message: error.message,
      status: error.status,
    });

    return NextResponse.redirect(
      resetUrl(request, { error: "reset-failed" }),
      303
    );
  }

  return NextResponse.redirect(resetUrl(request, { sent: "1" }), 303);
}
