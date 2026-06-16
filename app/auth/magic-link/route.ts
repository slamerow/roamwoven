import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { hasSupabaseServerConfig } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginUrl(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/login", request.url);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/maker").trim() || "/maker";

  if (!email) {
    return NextResponse.redirect(
      loginUrl(request, { error: "missing-email", next }),
      303
    );
  }

  if (!hasSupabaseServerConfig()) {
    return NextResponse.redirect(
      loginUrl(request, { error: "auth-not-configured", next }),
      303
    );
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = getAppUrl();
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    console.warn("Supabase magic-link send failed", {
      code: error.code,
      message: error.message,
      status: error.status,
    });

    const errorCode =
      error.code === "over_email_send_rate_limit"
        ? "email-rate-limited"
        : "send-failed";

    return NextResponse.redirect(
      loginUrl(request, { error: errorCode, next }),
      303
    );
  }

  return NextResponse.redirect(loginUrl(request, { sent: "1", next }), 303);
}
