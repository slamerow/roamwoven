import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { cleanupAbandonedUnpaidStarterMaterials } from "@/lib/uploads";

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

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
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
