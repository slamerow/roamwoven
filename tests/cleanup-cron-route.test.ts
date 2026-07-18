import assert from "node:assert/strict";
import { hasStrongPlannedActivityLanguage } from "@/lib/trip-card-taxonomy";
import { GET as cleanupCronRoute } from "@/app/api/cron/cleanup-unpaid-materials/route";

// Phase-0 fixtures (docs/code-audit-2026-07-18.md): the wired retention cron
// route's terminal outcomes (RW-OPS-001), and the contraction fix for the
// commitment pattern (audit finding B1 — the raw-apostrophe alternations were
// tested against apostrophe-stripped text and could never match).

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function cronRequest(authorization?: string) {
  return new Request("https://roamwoven.com/api/cron/cleanup-unpaid-materials", {
    headers: authorization ? { authorization } : {},
    method: "GET",
  });
}

export default async function run() {
  await test("cleanup cron without CRON_SECRET is a named recovery state, not a crash", async () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    try {
      const response = await cleanupCronRoute(cronRequest());
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "cron_not_configured");
    } finally {
      if (previous !== undefined) process.env.CRON_SECRET = previous;
    }
  });

  await test("cleanup cron rejects a wrong or missing bearer token and logs each rejected attempt", async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    const originalWarn = console.warn;
    const warned: Array<[unknown, unknown]> = [];
    console.warn = (...args: unknown[]) => {
      warned.push([args[0], args[1]]);
    };

    try {
      const unauthorized = await cleanupCronRoute(cronRequest());
      assert.equal(unauthorized.status, 401);

      const wrong = await cleanupCronRoute(cronRequest("Bearer nope"));
      assert.equal(wrong.status, 401);

      // Arc A hardening: same-length wrong secrets are rejected too (the
      // timing-safe digest compare has no length or prefix shortcut).
      const sameLength = await cleanupCronRoute(
        cronRequest("Bearer test-cron-secreX")
      );
      assert.equal(sameLength.status, 401);

      const rejections = warned.filter(
        ([event]) => event === "cron_cleanup_unauthorized_attempt"
      );
      assert.equal(
        rejections.length,
        3,
        "every rejected attempt is logged (RW-OPS-001 telemetry)"
      );
      const detail = rejections[1][1] as Record<string, unknown>;
      assert.equal(detail.hadBearerShape, true);
      assert.equal(typeof detail.timestamp, "string");
    } finally {
      console.warn = originalWarn;
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });

  await test("cleanup cron with auth but no Supabase admin config never deletes anything", async () => {
    const previousSecret = process.env.CRON_SECRET;
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const response = await cleanupCronRoute(
        cronRequest("Bearer test-cron-secret")
      );
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "supabase_not_configured");
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
      if (previousUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      if (previousKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  await test("commitment language recognizes first-person contractions (audit B1)", () => {
    const card = (description: string) => ({
      category: "art_culture",
      date: "2019-01-21",
      description,
      itemType: "activity" as const,
      title: "Pinball Museum",
    });

    assert.equal(
      hasStrongPlannedActivityLanguage(card("We'll visit the Pinball Museum.")),
      true
    );
    assert.equal(
      hasStrongPlannedActivityLanguage(card("We're going to Schonbrunn.")),
      true
    );
    assert.equal(
      hasStrongPlannedActivityLanguage(card("We'd like to see the museum.")),
      true
    );
    assert.equal(
      hasStrongPlannedActivityLanguage(card("Visit the museum.")),
      false
    );
  });
}
