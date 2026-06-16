import Link from "next/link";
import { hasSupabaseServerConfig } from "@/lib/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string; sent?: string }>;
}) {
  const { error, next = "/maker", sent } = await searchParams;
  const authConfigured = hasSupabaseServerConfig();

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-md">
        <Link className="text-sm font-semibold text-moss" href="/">
          Roamwoven
        </Link>
        <h1 className="mt-6 text-4xl font-semibold text-ink">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          We will email a secure sign-in link for your maker dashboard.
        </p>

        <form
          action="/auth/magic-link"
          className="mt-8 space-y-4 rounded-md border border-ink/10 bg-white p-5"
          method="post"
        >
          <input name="next" type="hidden" value={next} />
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
              Check your email for the sign-in link.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
              {error === "missing-email"
                ? "Enter an email address to continue."
                : error === "auth-not-configured"
                  ? "Supabase auth is not configured yet."
                  : error === "email-rate-limited"
                    ? "Supabase is rate-limiting sign-in emails right now. Try again later or configure custom SMTP."
                    : "Could not send the sign-in link."}
            </p>
          ) : null}
          <button
            className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper disabled:bg-ink/30"
            disabled={!authConfigured}
            type="submit"
          >
            Email me a sign-in link
          </button>
        </form>
      </div>
    </main>
  );
}
