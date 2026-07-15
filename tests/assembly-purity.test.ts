import assert from "node:assert/strict";
import {
  FinalizedCanonicalMutationError,
  finalizeCanonicalTripDraft,
  NonCanonicalDraftError,
} from "@/lib/extraction/canonical-trip-finalization";
import { EVIDENCE_CLUSTER_VERSION } from "@/lib/extraction/evidence-clustering";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

export default async function run() {
  await test("canonical finalization cannot mutate traveler pieces", () => {
    const activities = [
      {
        _canonicalId: "schonbrunn",
        _canonicalPieceId: "schonbrunn",
        category: "art_culture",
        date: "2019-01-19",
        description: "Schönbrunn Palace complex.",
        itemType: "activity",
        title: "Schönbrunn Palace complex",
      },
      {
        _canonicalId: "hundertwasser",
        _canonicalPieceId: "hundertwasser",
        category: "art_culture",
        date: "2019-01-19",
        description: "Visit Hundertwasser House.",
        itemType: "activity",
        title: "Hundertwasser House",
      },
    ];
    const result = finalizeCanonicalTripDraft({
      _evidence: {
        canonicalEntityIds: ["schonbrunn", "hundertwasser"],
        canonicalPieceIds: ["schonbrunn", "hundertwasser"],
        observationIds: ["obs-1", "obs-2"],
        version: EVIDENCE_CLUSTER_VERSION,
      },
      activities,
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {},
    });
    const draft = result.draft as { activities: typeof activities };

    assert.deepEqual(draft.activities, activities);
    assert.equal(result.debug.canonicalEntityCount, 2);
    assert.equal(result.debug.canonicalIdentityVersion, 1);
    assert.equal(result.debug.status, "finalized");

    const mutated = structuredClone(result.draft) as {
      activities: Array<Record<string, unknown>>;
    };
    mutated.activities.reverse();
    assert.throws(
      () => finalizeCanonicalTripDraft(mutated),
      FinalizedCanonicalMutationError
    );
  });

  await test("strict finalization rejects noncanonical drafts", () => {
    assert.throws(
      () => finalizeCanonicalTripDraft({ activities: [] }),
      NonCanonicalDraftError
    );
  });

  await test("stale finalization markers cannot enter the fresh canonical path", () => {
    assert.throws(
      () =>
        finalizeCanonicalTripDraft({
        _canonicalFinalization: { version: 1 },
        _evidence: { version: EVIDENCE_CLUSTER_VERSION - 1 },
        }),
      NonCanonicalDraftError
    );
  });
}
