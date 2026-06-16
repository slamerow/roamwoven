import Link from "next/link";
import { hasSupabaseServerConfig } from "@/lib/auth";

function updateMessage(error?: string) {
  if (error === "missing-password") {
    return "Enter a new password with at least 8 characters.";
  }

  if (error === "auth-not-configured") {
    return "Supabase auth is not configured yet.";
  }

  if (error === "update-failed") {
    return "Could not update your password. The reset link may have expired.";
  }

  return null;
}

export default async function UpdatePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { error, updated } = await searchParams;
  const authConfigured = hasSupabaseServerConfig();
  const message = updateMessage(error);

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-md">
        <Link className="text-sm font-semibold text-moss" href="/login">
          Back to sign in
        </Link>
        <h1 className="mt-6 text-4xl font-semibold text-ink">
          Set new password
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Choose a new password for your maker dashboard.
        </p>

        <form
          action="/auth/password-update"
          className="mt-8 space-y-4 rounded-md border border-ink/10 bg-white p-5"
          method="post"
        >
          <label className="block">
            <span className="text-sm font-semibold text-ink">
              New password
            </span>
            <input
              className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              type="password"
            />
          </label>
          {updated ? (
            <p className="rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
              Password updated. You can now sign in.
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
            Save new password
          </button>
        </form>
      </div>
    </main>
  );
}
