import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { cleanupAbandonedUnpaidStarterMaterials } from "@/lib/uploads";

// Arc A cron hardening (RW-OPS-001): the bearer compare is timing-safe (a
// plain string !== leaks a byte-position timing oracle for the secret), and
// every rejected attempt is logged with enough context to notice probing.
// Hashing both sides to fixed-length digests removes the length oracle too.
function bearerTokenMatches(authorization: string | null, secret: string) {
  const presented = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!presented) {
    return false;
  }

  const presentedDigest = createHash("sha256").update(presented).digest();
  const secretDigest = createHash("sha256").update(secret).digest();

  return timingSafeEqual(presentedDigest, secretDigest);
}

// Scheduled retention job (CEO decision 2026-07-18): source files uploaded to
// trips that were never paid and never processed are removed after the
// retention window. Invoked by Vercel Cron (see vercel.json), which sends
// GET with `Authorization: Bearer ${CRON_SECRET}` when the CRON_SECRET env
// var is configured.
//
// Route-level outcomes (RW-OPS-001 — every path terminates in a named
// state, never a crash):
// - 503 cron_not_configured    CRON_SECRET missing; job cannot be verified.
// - 401 unauthorized           wrong/absent bearer token.
// - 503 supabase_not_configured admin credentials missing; nothing deleted.
// - 200 { ok: true, ... }      counts of found/deleted files and rows.
// - 500 cleanup_failed         named failure, logged; retried on next tick.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "cron_not_configured" },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization");

  if (!bearerTokenMatches(authorization, secret)) {
    console.warn("cron_cleanup_unauthorized_attempt", {
      hadAuthorizationHeader: authorization !== null,
      hadBearerShape: Boolean(authorization?.startsWith("Bearer ")),
      requestIp:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { url, serviceRoleKey } = getSupabaseConfig();

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 503 }
    );
  }

  try {
    const result = await cleanupAbandonedUnpaidStarterMaterials({
      dryRun: false,
    });

    console.log("unpaid_starter_material_cleanup_completed", result);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("unpaid_starter_material_cleanup_failed", {
      message: error instanceof Error ? error.message : "Unknown error.",
    });

    return NextResponse.json({ error: "cleanup_failed" }, { status: 500 });
  }
}
