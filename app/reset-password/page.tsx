import Link from "next/link";
import { hasSupabaseServerConfig } from "@/lib/auth";

function resetMessage(error?: string) {
  if (error === "missing-email") {
    return "Enter your email address to reset your password.";
  }

  if (error === "auth-not-configured") {
    return "Supabase auth is not configured yet.";
  }

  if (error === "reset-failed") {
    return "Could not send the reset email. Try again in a few minutes.";
  }

  return null;
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const authConfigured = hasSupabaseServerConfig();
  const message = resetMessage(error);

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-md">
        <Link className="text-sm font-semibold text-moss" href="/login">
          Back to sign in
        </Link>
        <h1 className="mt-6 text-4xl font-semibold text-ink">
          Reset password
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          We will email a secure link to set a new password.
        </p>

        <form
          action="/auth/password-reset"
          className="mt-8 space-y-4 rounded-md border border-ink/10 bg-white p-5"
          method="post"
        >
          <label className="block">
            <span className="text-sm font-semibold text-ink">Email</span>
            <input
              className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
              name="email"
              placeholder="you@example.com"
              type="email"
            />
          </label>
          {sent ? (
            <p className="rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
              Check your email for the password reset link.
            </p>
          ) : null}
          {message ? (
            <p className="rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
              {message}
            </p>
          ) : null}
          <button
            className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper disabled:bg-ink/30"
            disabled={!authConfigured}
            type="submit"
          >
            Email reset link
          </button>
        </form>
      </div>
    </main>
  );
}
