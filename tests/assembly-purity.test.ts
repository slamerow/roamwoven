import assert from "node:assert/strict";
import {
  finalizeCanonicalTripDraft,
  NonCanonicalDraftError,
  preparePersistedTripDraftForStructuredCompilation,
} from "@/lib/extraction/canonical-trip-finalization";

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
        category: "art_culture",
        date: "2019-01-19",
        description: "Schönbrunn Palace complex.",
        itemType: "activity",
        title: "Schönbrunn Palace complex",
      },
      {
        category: "art_culture",
        date: "2019-01-19",
        description: "Visit Hundertwasser House.",
        itemType: "activity",
        title: "Hundertwasser House",
      },
    ];
    const result = finalizeCanonicalTripDraft({
      _evidence: {
        canonicalPieceIds: ["schonbrunn", "hundertwasser"],
        observationIds: ["obs-1", "obs-2"],
        version: 4,
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
    assert.equal(result.debug.status, "finalized");
  });

  await test("strict finalization rejects noncanonical drafts", () => {
    assert.throws(
      () => finalizeCanonicalTripDraft({ activities: [] }),
      NonCanonicalDraftError
    );
  });

  await test("historical snapshots stay readable without legacy mutation", () => {
    const historical = {
      _assembly: { version: 3 },
      activities: [{ title: "Stored historical activity" }],
    };

    assert.strictEqual(
      preparePersistedTripDraftForStructuredCompilation(historical),
      historical
    );
  });
}
