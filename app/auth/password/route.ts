import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { hasSupabaseServerConfig } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/maker";
  }

  return value;
}

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
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/maker").trim());
  const intent =
    String(formData.get("intent") ?? "sign-in") === "sign-up"
      ? "sign-up"
      : "sign-in";

  if (!email || !password) {
    return NextResponse.redirect(
      loginUrl(request, { error: "missing-password-login", next }),
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

  if (intent === "sign-up") {
    const callbackUrl = new URL("/auth/callback", getAppUrl());
    callbackUrl.searchParams.set("next", next);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      console.warn("Supabase password signup failed", {
        code: error.code,
        message: error.message,
        status: error.status,
      });

      return NextResponse.redirect(
        loginUrl(request, { error: "password-signup-failed", next }),
        303
      );
    }

    if (data.session) {
      return NextResponse.redirect(new URL(next, request.url), 303);
    }

    return NextResponse.redirect(
      loginUrl(request, { created: "1", next }),
      303
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.warn("Supabase password signin failed", {
      code: error.code,
      message: error.message,
      status: error.status,
    });

    return NextResponse.redirect(
      loginUrl(request, { error: "password-auth-failed", next }),
      303
    );
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
