import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupportedOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email"
  | "email_change";

const supportedOtpTypes = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/maker";
  }

  return value;
}

function redirectToAuthError(request: NextRequest, next: string, error: string) {
  const isPasswordReset = next.startsWith("/reset-password");
  const redirectUrl = new URL(
    isPasswordReset ? "/reset-password/update" : "/login",
    request.url
  );
  redirectUrl.searchParams.set("error", error);

  if (!isPasswordReset) {
    redirectUrl.searchParams.set("next", next);
  }

  return NextResponse.redirect(redirectUrl, 303);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNext(url.searchParams.get("next"));
  const supabaseError = url.searchParams.get("error");
  const supabaseErrorCode = url.searchParams.get("error_code");
  const supabaseErrorDescription = url.searchParams.get("error_description");

  if (supabaseError || supabaseErrorCode) {
    console.warn("Supabase auth callback returned an error", {
      error: supabaseError,
      errorCode: supabaseErrorCode,
      errorDescription: supabaseErrorDescription,
    });

    return redirectToAuthError(request, next, "auth-failed");
  }

  if (!code && !tokenHash) {
    console.warn("Supabase auth callback missing exchange parameters", {
      searchParamKeys: Array.from(url.searchParams.keys()),
    });

    return redirectToAuthError(request, next, "auth-failed");
  }

  const supabase = await createSupabaseServerClient();
  const otpType: SupportedOtpType = supportedOtpTypes.has(type ?? "")
    ? (type as SupportedOtpType)
    : "email";
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash ?? "",
        type: otpType,
      });

  if (error) {
    console.warn("Supabase auth callback exchange failed", {
      code: error.code,
      message: error.message,
      status: error.status,
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      type,
    });

    return redirectToAuthError(request, next, "auth-failed");
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
