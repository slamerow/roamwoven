import Link from "next/link";
import { hasSupabaseServerConfig } from "@/lib/auth";

function passwordErrorMessage(error?: string) {
  if (error === "missing-password-login") {
    return "Enter an email and password to continue.";
  }

  if (error === "auth-not-configured") {
    return "Supabase auth is not configured yet.";
  }

  if (error === "password-auth-failed") {
    return "Email or password did not work.";
  }

  if (error === "password-signup-failed") {
    return "Could not create that account. Try signing in, or use a different password.";
  }

  if (error === "auth-failed") {
    return "Could not complete sign-in. The link may have expired or already been opened.";
  }

  return null;
}

function magicLinkErrorMessage(error?: string) {
  if (error === "missing-email") {
    return "Enter an email address to continue.";
  }

  if (error === "auth-not-configured") {
    return "Supabase auth is not configured yet.";
  }

  if (error === "email-rate-limited") {
    return "Supabase is rate-limiting sign-in emails right now. Try again later or configure custom SMTP.";
  }

  if (error === "send-failed") {
    return "Could not send the sign-in link.";
  }

  return null;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{
    created?: string;
    error?: string;
    next?: string;
    sent?: string;
  }>;
}) {
  const { created, error, next = "/maker", sent } = await searchParams;
  const authConfigured = hasSupabaseServerConfig();
  const passwordError = passwordErrorMessage(error);
  const magicLinkError = magicLinkErrorMessage(error);

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-md">
        <Link className="text-sm font-semibold text-moss" href="/">
          Roamwoven
        </Link>
        <h1 className="mt-6 text-4xl font-semibold text-ink">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Sign in to your maker dashboard.
        </p>

        <form
          action="/auth/password"
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
          <label className="block">
            <span className="text-sm font-semibold text-ink">Password</span>
            <input
              className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              type="password"
            />
          </label>
          {created ? (
            <p className="rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
              Account created. Check your email to confirm it, then sign in with
              your password.
            </p>
          ) : null}
          {passwordError ? (
            <p className="rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
              {passwordError}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper disabled:bg-ink/30"
              disabled={!authConfigured}
              name="intent"
              type="submit"
              value="sign-in"
            >
              Sign in
            </button>
            <button
              className="rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink disabled:text-ink/30"
              disabled={!authConfigured}
              name="intent"
              type="submit"
              value="sign-up"
            >
              Create account
            </button>
          </div>
          <Link
            className="inline-flex text-sm font-semibold text-moss"
            href="/reset-password"
          >
            Forgot password?
          </Link>
        </form>

        <form
          action="/auth/magic-link"
          className="mt-4 space-y-4 rounded-md border border-ink/10 bg-white p-5"
          method="post"
        >
          <input name="next" type="hidden" value={next} />
          <label className="block">
            <span className="text-sm font-semibold text-ink">
              Magic link
            </span>
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
          {magicLinkError ? (
            <p className="rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
              {magicLinkError}
            </p>
          ) : null}
          <button
            className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper disabled:bg-ink/30"
            disabled={!authConfigured}
            type="submit"
          >
            Email me a login link
          </button>
        </form>
      </div>
    </main>
  );
}
