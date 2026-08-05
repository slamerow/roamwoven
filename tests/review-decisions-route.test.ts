import assert from "node:assert/strict";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function bulkRequest(subjectIds: string) {
  const formData = new FormData();
  formData.set("action", "confirm");
  formData.set("subjectId", subjectIds.split(",")[0] ?? "");
  formData.set("subjectIds", subjectIds);
  formData.set("subjectType", "item");

  return new Request("http://localhost/maker/trips/trip-1/data/decisions", {
    body: formData,
    headers: { accept: "application/json" },
    method: "POST",
  });
}

export default async function run() {
  const applied = require("@/lib/applied-trip-records") as {
    getAppliedTripRecords: (...args: unknown[]) => Promise<unknown>;
  };
  const anchors = require("@/lib/review-decision-anchor") as {
    createReviewDecisionAnchor: (...args: unknown[]) => unknown;
  };
  const decisions = require("@/lib/review-decisions") as {
    saveTripReviewDecision: (...args: unknown[]) => Promise<unknown>;
  };
  const trips = require("@/lib/trips") as {
    getMakerTrip: (...args: unknown[]) => Promise<unknown>;
  };
  const originals = {
    getAppliedTripRecords: applied.getAppliedTripRecords,
    createReviewDecisionAnchor: anchors.createReviewDecisionAnchor,
    saveTripReviewDecision: decisions.saveTripReviewDecision,
    getMakerTrip: trips.getMakerTrip,
  };
  const routePath = require.resolve(
    "@/app/maker/trips/[tripId]/data/decisions/route"
  );
  let savedSubjectIds: string[] = [];

  applied.getAppliedTripRecords = async () => ({ records: {} });
  anchors.createReviewDecisionAnchor = (_records, _type, id) =>
    id === "stale-2"
      ? null
      : {
          key: `item:${id}`,
          kind: "record",
          version: 1,
        };
  decisions.saveTripReviewDecision = async (input: unknown) => {
    savedSubjectIds.push(String((input as { subjectId?: string }).subjectId));
    return {};
  };
  trips.getMakerTrip = async () => ({
    isDemo: false,
    name: "QA trip",
    paymentStatus: "paid",
  });
  delete require.cache[routePath];
  const { POST } = require(routePath) as {
    POST: (
      request: Request,
      context: { params: Promise<{ tripId: string }> }
    ) => Promise<Response>;
  };

  try {
    await test(
      "bulk maker decisions resolve every stable anchor before starting any write",
      async () => {
        savedSubjectIds = [];
        const response = await POST(bulkRequest("valid-1,stale-2"), {
          params: Promise.resolve({ tripId: "trip-1" }),
        });
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.deepEqual(body, {
          error: "decision-save-failed",
          ok: false,
        });
        assert.deepEqual(
          savedSubjectIds,
          [],
          "a later stale anchor must prevent every write in the bulk request"
        );
      }
    );

    await test("a fully anchored bulk maker decision saves every subject", async () => {
      savedSubjectIds = [];
      const response = await POST(bulkRequest("valid-1,valid-2"), {
        params: Promise.resolve({ tripId: "trip-1" }),
      });
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { decision: "saved", ok: true });
      assert.deepEqual(savedSubjectIds.sort(), ["valid-1", "valid-2"]);
    });
  } finally {
    applied.getAppliedTripRecords = originals.getAppliedTripRecords;
    anchors.createReviewDecisionAnchor = originals.createReviewDecisionAnchor;
    decisions.saveTripReviewDecision = originals.saveTripReviewDecision;
    trips.getMakerTrip = originals.getMakerTrip;
    delete require.cache[routePath];
  }
}
