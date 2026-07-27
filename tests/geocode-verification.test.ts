import assert from "node:assert/strict";
import {
  runGeocodeVerification,
  selectGeocodeCandidates,
} from "@/lib/extraction/geocode-verification";
import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";

// Geocoding verification lane (Arc B; standing CEO decision 2026-07-17/18):
// env-keyed, hard per-trip budget, fail-soft, results attached as VERIFIED
// coordinates with provenance, used ONLY to verify grouping proximity —
// lookups never change intent, date, city, or title (RW-EVD-001 posture).
// V1 keeps results in the run's usage JSON: no new DB tables.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function stageWith(activities: Array<Record<string, unknown>>): EvidenceStageInput {
  return {
    label: "Tuesday, January 15th",
    source: "model_chunk",
    stage: {
      activities,
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

const CONFIG = {
  apiKey: "test-key",
  endpoint: "https://geocode.example/api",
  maxLookups: 10,
  timeoutMs: 1000,
};

function okFetch(lat: number, lng: number, formattedAddress?: string) {
  return async () =>
    ({
      ok: true,
      json: async () => ({
        results: [
          {
            ...(formattedAddress
              ? { formatted_address: formattedAddress }
              : {}),
            geometry: { location: { lat, lng } },
          },
        ],
        status: "OK",
      }),
    }) as Response;
}

export default async function run() {
  await test("no API key: the lane is disabled, no lookups happen, the draft is untouched", async () => {
    let called = 0;
    const stages = [
      stageWith([{ city: "Prague", date: "2019-01-15", title: "Prague Castle" }]),
    ];
    const result = await runGeocodeVerification({
      config: { ...CONFIG, apiKey: null },
      fetchImpl: (async () => {
        called += 1;
        throw new Error("must not be called");
      }) as unknown as typeof fetch,
      stages,
    });

    assert.equal(result.usage.outcome, "disabled");
    assert.equal(result.usage.lookupCount, 0);
    assert.equal(called, 0);
  });

  await test("verified coordinates attach with provenance; intent/date/city/title fields never change", async () => {
    const card: Record<string, unknown> = {
      approxLatitude: 50.09, // 2-decimal parser coords: radius-ineligible
      approxLongitude: 14.4,
      category: "art_culture",
      city: "Prague",
      date: "2019-01-15",
      description: "Prague Castle and Golden Lane.",
      itemType: "activity",
      title: "Prague Castle",
    };
    const before = { ...card };
    const stages = [stageWith([card])];
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: okFetch(50.0911, 14.4016) as unknown as typeof fetch,
      stages,
    });

    assert.equal(result.usage.outcome, "completed");
    assert.equal(result.usage.resolvedCount, 1);
    assert.equal(card.verifiedLatitude, 50.0911);
    assert.equal(card.verifiedLongitude, 14.4016);
    assert.equal(card._geoVerified, true);
    const provenance = card._geoVerification as Record<string, unknown>;
    assert.equal(provenance.provider, "geocode");
    assert.match(String(provenance.query), /Prague Castle/);
    for (const field of ["title", "date", "city", "description", "itemType", "category"]) {
      assert.equal(card[field], before[field], `${field} never changes`);
    }
  });

  await test("Arc G.3a: the formatted address in the response is KEPT, and it is still proximity-only", async () => {
    // The lane was already paying for this field and parsing it away. It
    // is what lets a same-site visit recognize a stop 800 m out that the
    // radius refuses (Schönbrunn's Gloriette).
    const card: Record<string, unknown> = {
      category: "art_culture",
      city: "Vienna",
      date: "2019-01-19",
      itemType: "activity",
      title: "Gloriette",
    };
    const before = { ...card };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: okFetch(
        48.1774,
        16.3121,
        "Gloriette, Schönbrunner Schloßstraße 47, 1130 Wien, Austria"
      ) as unknown as typeof fetch,
      stages: [stageWith([card])],
    });

    assert.equal(result.usage.resolvedCount, 1);
    assert.equal(result.usage.formattedAddressCount, 1);
    assert.equal(
      card.verifiedFormattedAddress,
      "Gloriette, Schönbrunner Schloßstraße 47, 1130 Wien, Austria"
    );
    for (const field of ["title", "date", "city", "itemType", "category"]) {
      assert.equal(card[field], before[field], `${field} never changes`);
    }
  });

  await test("Arc G.3a: a response without a formatted address still resolves on coordinates alone", async () => {
    const card: Record<string, unknown> = {
      city: "Vienna",
      date: "2019-01-19",
      itemType: "activity",
      title: "Gloriette",
    };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: okFetch(48.1774, 16.3121) as unknown as typeof fetch,
      stages: [stageWith([card])],
    });

    assert.equal(result.usage.resolvedCount, 1);
    assert.equal(result.usage.formattedAddressCount, 0);
    assert.equal(card.verifiedFormattedAddress, undefined);
    assert.equal(card._geoVerified, true);
  });

  await test("hard per-trip budget: lookups stop at maxLookups and the overflow is counted, never silent", async () => {
    const cards = Array.from({ length: 8 }, (_, index) => ({
      city: "Prague",
      date: "2019-01-15",
      itemType: "activity",
      title: `Sight number ${index} tower`,
    }));
    let calls = 0;
    const result = await runGeocodeVerification({
      config: { ...CONFIG, maxLookups: 3 },
      fetchImpl: (async () => {
        calls += 1;
        return {
          ok: true,
          json: async () => ({
            results: [{ geometry: { location: { lat: 50.1, lng: 14.4 } } }],
            status: "OK",
          }),
        } as Response;
      }) as unknown as typeof fetch,
      stages: [stageWith(cards)],
    });

    assert.equal(calls, 3, "the budget is a hard cap");
    assert.equal(result.usage.lookupCount, 3);
    assert.equal(result.usage.skippedOverBudgetCount, 5);
  });

  await test("fail-soft: fetch errors and non-OK responses never throw; the run continues with parser coordinates", async () => {
    const card: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-15",
      itemType: "activity",
      title: "Charles Bridge",
    };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
      stages: [stageWith([card])],
    });

    assert.equal(result.usage.outcome, "failed");
    assert.equal(result.usage.failedCount, 1);
    assert.equal(card.verifiedLatitude, undefined, "no partial writes on failure");
  });

  await test("candidate selection: site containers first, then crowded-day sights; notes and transport-shaped records never geocode", () => {
    const crowded = Array.from({ length: 7 }, (_, index) => ({
      city: "Prague",
      date: "2019-01-15",
      itemType: "activity",
      title: `Old Town sight ${index}`,
    }));
    const stages = [
      stageWith([
        { city: "Vienna", date: "2019-01-19", itemType: "activity", title: "Schonbrunn Palace" },
        { city: "Prague", date: "2019-01-16", itemType: "note", title: "Prague food ideas" },
        ...crowded,
        { city: "Prague", date: "2019-01-16", itemType: "activity", title: "Lone quiet-day stop" },
      ]),
    ];
    const candidates = selectGeocodeCandidates(stages);
    const titles = candidates.map((candidate) => String(candidate.record.title));

    assert.equal(titles[0], "Schonbrunn Palace", "site containers rank first");
    assert.equal(
      titles.includes("Prague food ideas"),
      false,
      "notes are never geocoded"
    );
    assert.equal(
      titles.filter((title) => /old town sight/i.test(title)).length,
      7,
      "crowded-day sights are walk candidates"
    );
  });
}
