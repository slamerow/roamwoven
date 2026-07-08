import assert from "node:assert/strict";
import {
  createRedactedTripProcessingEvent,
  listTripProcessingEvents,
} from "@/lib/extraction/processing-events";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function mockSupabaseEvents(response: {
  data?: unknown[];
  error?: { code?: string; message: string } | null;
}) {
  const originalCreateSupabaseServerClient =
    require("@/lib/supabase/server").createSupabaseServerClient;
  const calls: Array<{ method: string; value: unknown }> = [];

  require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
    from: (table: string) => {
      calls.push({ method: "from", value: table });

      return {
        select: (columns: string) => {
          calls.push({ method: "select", value: columns });

          return {
            eq: (column: string, value: string) => {
              calls.push({ method: "eq", value: { column, value } });

              return {
                order: (column: string, options: { ascending: boolean }) => {
                  calls.push({ method: "order", value: { column, options } });

                  return Promise.resolve({
                    data: response.data ?? null,
                    error: response.error ?? null,
                  });
                },
              };
            },
          };
        },
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
  await test("listTripProcessingEvents loads timeline rows in created order", async () => {
    const mock = mockSupabaseEvents({
      data: [
        {
          created_at: "2026-07-08T00:00:00.000Z",
          details: { materialCount: 2 },
          error_message: null,
          id: "event-1",
          processing_run_id: "run-1",
          stage: "material_checkpoint",
          status: "completed",
          trip_id: "trip-1",
        },
      ],
    });

    try {
      const events = await listTripProcessingEvents("trip-1");

      assert.equal(events.length, 1);
      assert.equal(events[0]?.id, "event-1");
      assert.deepEqual(events[0]?.details, { materialCount: 2 });
      assert.deepEqual(mock.calls.at(-1), {
        method: "order",
        value: { column: "created_at", options: { ascending: true } },
      });
    } finally {
      mock.restore();
    }
  });

  await test("listTripProcessingEvents tolerates older databases without events", async () => {
    const mock = mockSupabaseEvents({
      error: { code: "PGRST205", message: "Table not found." },
    });

    try {
      const events = await listTripProcessingEvents("trip-1");

      assert.deepEqual(events, []);
    } finally {
      mock.restore();
    }
  });

  await test("createRedactedTripProcessingEvent hides sensitive details by default", () => {
    const redacted = createRedactedTripProcessingEvent({
      createdAt: "2026-07-08T00:00:00.000Z",
      details: {
        confirmationLabel: "ABC123",
        rawText: "Door code 2468.",
        statusCounts: { text_ready: 1 },
      },
      errorMessage: "Call +1 555 123 4567.",
      id: "event-1",
      processingRunId: "run-1",
      stage: "ocr",
      status: "failed",
      tripId: "trip-1",
    });

    assert.equal(redacted.details.confirmationLabel, "[redacted value]");
    assert.equal(redacted.details.rawText, "[redacted value]");
    assert.deepEqual(redacted.details.statusCounts, { text_ready: 1 });
    assert.equal(redacted.errorMessage, "Call [redacted phone].");
  });
}
