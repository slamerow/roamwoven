import assert from "node:assert/strict";
import {
  completeTripProcessingRun,
  failTripProcessingRun,
} from "@/lib/extraction/processing-runs";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function mockSupabaseRpc(response: {
  data?: unknown;
  error?: { message: string } | null;
}) {
  const originalCreateSupabaseServerClient =
    require("@/lib/supabase/server").createSupabaseServerClient;
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];

  require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
    rpc: (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });

      return {
        data: response.data ?? null,
        error: response.error ?? null,
        single: async () => ({
          data: response.data ?? null,
          error: response.error ?? null,
        }),
      };
    },
  });

  return {
    calls,
    restore() {
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    },
  };
}

export default async function run() {
  await test("completeTripProcessingRun commits through the transactional RPC", async () => {
    const mock = mockSupabaseRpc({
      data: {
        created_at: "2026-07-08T00:00:00.000Z",
        draft_json: { trip: { name: "Central Europe" } },
        id: "snapshot-1",
        processing_run_id: "run-1",
        source: "openai_initial_parse",
        trip_id: "trip-1",
      },
    });

    try {
      const snapshot = await completeTripProcessingRun({
        draftJson: { trip: { name: "Central Europe" } },
        model: "gpt-test",
        runId: "run-1",
        tripId: "trip-1",
        usage: { staged: true },
      });

      assert.equal(snapshot.id, "snapshot-1");
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0]?.name, "complete_trip_processing_run");
      assert.deepEqual(mock.calls[0]?.params, {
        p_draft_json: { trip: { name: "Central Europe" } },
        p_model: "gpt-test",
        p_run_id: "run-1",
        p_trip_id: "trip-1",
        p_usage: { staged: true },
      });
    } finally {
      mock.restore();
    }
  });

  await test("failTripProcessingRun commits through the transactional RPC", async () => {
    const mock = mockSupabaseRpc({});

    try {
      await failTripProcessingRun({
        errorMessage: "Model failed",
        failureDetails: { stage: "model" },
        runId: "run-1",
        tripId: "trip-1",
      });

      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0]?.name, "fail_trip_processing_run");
      assert.deepEqual(mock.calls[0]?.params, {
        p_error_message: "Model failed",
        p_failure_details: { stage: "model" },
        p_run_id: "run-1",
        p_trip_id: "trip-1",
      });
    } finally {
      mock.restore();
    }
  });
}
