import assert from "node:assert/strict";
import { publishTripSnapshot } from "@/lib/published-snapshots";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function createMinimalRecords(): StructuredTripRecords {
  return {
    categories: [],
    days: [],
    items: [],
    legs: [],
    photos: [],
    phrases: [],
    privateDetails: [
      {
        detailType: "confirmation_number",
        id: "detail-1",
        label: "Confirmation",
        reason: "Booking references should default behind traveler mode.",
        reviewRequired: false,
        sourceConfidence: "medium",
        subjectId: "transport-1",
        subjectType: "transport",
        tripId: "trip-1",
        value: "ABC123",
        visibility: "traveler_password",
      },
    ],
    reviewQuestions: [],
    stays: [],
    transport: [],
    trip: {
      destinationSummary: null,
      endDate: null,
      id: "trip-1",
      name: "Central Europe",
      startDate: null,
      travelerAppTitle: "Central Europe",
    },
    weatherHooks: [],
  };
}

function mockPublishDependencies(response: {
  data?: unknown;
  error?: { message: string } | null;
}) {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalGetCurrentUser = require("@/lib/auth").getCurrentUser;
  const originalCreateSupabaseServerClient =
    require("@/lib/supabase/server").createSupabaseServerClient;
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  require("@/lib/auth").getCurrentUser = async () => ({
    email: "maker@example.com",
    id: "user-1",
  });
  require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
    rpc: (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });

      const builder = {
        data: response.data ?? null,
        error: response.error ?? null,
        select: () => builder,
        single: async () => ({
          data: response.data ?? null,
          error: response.error ?? null,
        }),
      };

      return builder;
    },
  });

  return {
    calls,
    restore() {
      if (originalSupabaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
      }

      if (originalSupabaseAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
      }

      require("@/lib/auth").getCurrentUser = originalGetCurrentUser;
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    },
  };
}

export default async function run() {
  await test("publishTripSnapshot commits snapshot and private details through the transactional RPC", async () => {
    const mock = mockPublishDependencies({
      data: {
        created_at: "2026-07-08T00:00:00.000Z",
        id: "snapshot-1",
        share_token: "share-token-1",
        snapshot_json: {
          createdFrom: "structured_trip_records",
          recordsSummary: {
            cardCount: 0,
            dayCount: 0,
            legCount: 0,
            privateDetailCount: 1,
            sourceConfidence: "medium",
          },
          schemaVersion: 1,
          travelerApp: {},
        },
        trip_id: "trip-1",
        version: 2,
      },
    });

    try {
      const snapshot = await publishTripSnapshot({
        records: createMinimalRecords(),
        tripId: "trip-1",
      });

      assert.equal(snapshot.id, "snapshot-1");
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0]?.name, "publish_trip_snapshot");
      assert.equal(mock.calls[0]?.params.p_created_by_user_id, "user-1");
      assert.equal(mock.calls[0]?.params.p_trip_id, "trip-1");
      assert.equal(typeof mock.calls[0]?.params.p_share_token, "string");
      assert.deepEqual(mock.calls[0]?.params.p_private_details, [
        {
          id: "detail-1",
          label: "Confirmation",
          reason: "Booking references should default behind traveler mode.",
          subjectId: "transport-1",
          subjectType: "transport",
          value: "ABC123",
          visibility: "traveler_password",
        },
      ]);
    } finally {
      mock.restore();
    }
  });
}
