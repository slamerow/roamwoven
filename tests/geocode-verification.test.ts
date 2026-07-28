import assert from "node:assert/strict";
import {
  runGeocodeVerification,
  selectGeocodeCandidates,
} from "@/lib/extraction/geocode-verification";
import { getGeocodeVerificationConfig } from "@/lib/env";
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

// --- Remediation-pass fixtures --------------------------------------------

type FakeGeocodeResult = {
  formatted_address?: string;
  lat: number;
  lng: number;
  types?: string[];
};

// The literal run-7.28.0 centroid, with the viewport Google returns
// alongside it. That viewport IS the city's bounding box, which is what
// G4.3's retry is checked against — no extra lookup is made to obtain it.
const PRAGUE_VIEWPORT = {
  northeast: { lat: 50.1774301, lng: 14.7067869 },
  southwest: { lat: 49.9419006, lng: 14.2244533 },
};

const PRAGUE_CENTROID: FakeGeocodeResult = {
  lat: 50.0755381,
  lng: 14.4378005,
  types: ["locality", "political"],
};

const PRAGUE_CENTROID_RESULT = {
  address_components: [
    { long_name: "Prague", short_name: "Praha", types: ["locality", "political"] },
  ],
  geometry: {
    location: { lat: PRAGUE_CENTROID.lat, lng: PRAGUE_CENTROID.lng },
    viewport: PRAGUE_VIEWPORT,
  },
  types: PRAGUE_CENTROID.types,
};

// Dispatches on the query string so a test can answer the standalone
// lookup and its container retry differently — which is the whole of G4.3.
function respondWith(byQuery: (query: string) => FakeGeocodeResult | null) {
  return (async (url: string) => {
    const address = new URL(url).searchParams.get("address") ?? "";
    const result = byQuery(address);

    return {
      ok: true,
      json: async () => ({
        results: result
          ? [
              {
                ...(result.formatted_address
                  ? { formatted_address: result.formatted_address }
                  : {}),
                address_components: [
                  {
                    long_name: "Prague",
                    short_name: "Praha",
                    types: ["locality", "political"],
                  },
                ],
                geometry: {
                  location: { lat: result.lat, lng: result.lng },
                  viewport: PRAGUE_VIEWPORT,
                },
                ...(result.types ? { types: result.types } : {}),
              },
            ]
          : [],
        status: result ? "OK" : "ZERO_RESULTS",
      }),
    } as Response;
  }) as unknown as typeof fetch;
}

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

  await test("Arc G.3a: a site container's same-day components are lookup candidates, so the address path can reach them", async () => {
    // The live shape (run 7.26.1, Jan 19): the palace is a container, the
    // five components carry precise-LOOKING parser coordinates and no area
    // label. As rank 2 they were skipped outright, so they had no address,
    // so the only components that could join the visit were the two with an
    // "at Schönbrunn" title token — which is exactly the 2 of 6 that
    // grouped.
    const component = (title: string) => ({
      approxLatitude: 48.184,
      approxLongitude: 16.312,
      city: "Vienna",
      date: "2019-01-19",
      itemType: "activity",
      title,
    });
    const candidates = selectGeocodeCandidates([
      stageWith([
        component("Schönbrunn Palace"),
        component("Gloriette"),
        component("Apple Strudel Show"),
        component("Panorama Train"),
        component("Orangeriegarten at Schönbrunn"),
        component("Palm House at Schönbrunn"),
      ]),
    ]);

    const queries = candidates.map((candidate) => candidate.query);
    for (const title of [
      "Schönbrunn Palace",
      "Gloriette",
      "Apple Strudel Show",
      "Panorama Train",
    ]) {
      assert.ok(
        queries.some((query) => query.startsWith(title)),
        `${title} is a lookup candidate`
      );
    }
    assert.equal(
      candidates[0].rank,
      0,
      "the container is still verified first"
    );
    // The budget cut must be deliberate, not alphabetical: every component
    // of a site visit outranks the general crowded-day pool, so a stop the
    // ship bar depends on cannot lose its lookup to a luckier name.
    for (const title of ["Gloriette", "Panorama Train", "Apple Strudel Show"]) {
      const candidate = candidates.find((entry) =>
        entry.query.startsWith(title)
      );
      assert.equal(candidate?.rank, 1, `${title} is in the same-site pool`);
    }
  });

  await test("Arc G.3a: the arbitration pool stays inside the budget on a trip-shaped corpus", async () => {
    // Run8's concern was a candidate pool ballooning past the budget
    // (145/191 vs 50). The promotion is bounded by the day, so assert the
    // number rather than trusting the rule to stay cheap: a 14-day trip
    // with three site-container days, ~6 cards a day.
    const days = Array.from({ length: 14 }, (_, index) => {
      const day = `2019-01-${String(12 + index).padStart(2, "0")}`;
      const containerDay = [2, 4, 10].includes(index);
      return Array.from({ length: 6 }, (_, cardIndex) => ({
        approxLatitude: 48.184 + cardIndex / 1000,
        approxLongitude: 16.312,
        city: "Vienna",
        date: day,
        itemType: "activity",
        title:
          containerDay && cardIndex === 0
            ? `Site ${index} Palace`
            : `Card ${index}-${cardIndex}`,
      }));
    }).flat();

    const candidates = selectGeocodeCandidates([stageWith(days)]);
    const arbitrationPool = candidates.filter(
      (candidate) => candidate.rank <= 2
    );

    assert.ok(
      arbitrationPool.length <= 50,
      `the pool that decides grouping fits inside the budget (got ${arbitrationPool.length})`
    );
    assert.equal(
      candidates.filter((candidate) => candidate.rank === 0).length,
      3,
      "one container per container day"
    );
  });

  // ---------------------------------------------------------------------
  // Geocoder remediation pass, run 7.28.0
  // (docs/geocoder-remediation-scope-2026-07-28.md, LOCKED with Eli).
  // ---------------------------------------------------------------------

  await test("G4.1: the shipped default budget is the 150 hard cap, not just a Vercel variable", () => {
    const previous = process.env.GEOCODE_VERIFICATION_MAX_LOOKUPS;
    delete process.env.GEOCODE_VERIFICATION_MAX_LOOKUPS;
    try {
      // A fresh environment must not be silently starved: run 7.28.0 left
      // 48 of 98 candidates unlooked-up, and Rome's whole Jan-13 leg
      // unverified, at the old default of 50.
      assert.equal(getGeocodeVerificationConfig().maxLookups, 150);
    } finally {
      if (previous === undefined) {
        delete process.env.GEOCODE_VERIFICATION_MAX_LOOKUPS;
      } else {
        process.env.GEOCODE_VERIFICATION_MAX_LOOKUPS = previous;
      }
    }
  });

  await test("G4.2: a locality-granularity result is NOT stamped verified, and is NOT an error", async () => {
    // The exact run-7.28.0 defect: the geocoder could not resolve the venue,
    // returned the Prague city centroid, and the lane recorded it as
    // verified — putting Changing of the Guard 3,108 m from the castle it
    // happens inside, and 31 activities on only 29 distinct points.
    const card: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-14",
      itemType: "activity",
      title: "Catacombs tour",
    };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: respondWith(() => PRAGUE_CENTROID),
      stages: [stageWith([card])],
    });

    assert.equal(result.usage.outcome, "completed", "rejection is not failure");
    assert.equal(result.usage.failedCount, 0, "a place is not a transport error");
    assert.equal(result.usage.localityRejectedCount, 1);
    assert.equal(result.usage.resolvedCount, 0);
    assert.equal(card.verifiedLatitude, undefined);
    assert.equal(card.verifiedLongitude, undefined);
    assert.equal(card._geoVerified, undefined, "no false verification");
  });

  await test("G4.2: administrative_area and postal_code results are rejected on the same criterion (D2)", async () => {
    for (const types of [
      ["administrative_area_level_1", "political"],
      ["administrative_area_level_2"],
      ["postal_code"],
      ["country", "political"],
    ]) {
      const card: Record<string, unknown> = {
        city: "Prague",
        date: "2019-01-14",
        itemType: "activity",
        title: "Some regional thing",
      };
      const result = await runGeocodeVerification({
        config: CONFIG,
        fetchImpl: respondWith(() => ({ ...PRAGUE_CENTROID, types })),
        stages: [stageWith([card])],
      });

      assert.equal(
        card._geoVerified,
        undefined,
        `${types.join("+")} is place granularity, not a venue`
      );
      assert.equal(result.usage.localityRejectedCount, 1);
    }
  });

  await test("G4.2: a venue result is unaffected — the guard is not a blanket tightening", async () => {
    const card: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "St. Vitus Cathedral",
    };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: respondWith(() => ({
        lat: 50.0909,
        lng: 14.4006,
        types: ["church", "place_of_worship", "point_of_interest"],
      })),
      stages: [stageWith([card])],
    });

    assert.equal(result.usage.resolvedCount, 1);
    assert.equal(result.usage.localityRejectedCount, 0);
    assert.equal(card._geoVerified, true);
  });

  await test("G4.3: a locality result is retried ONCE with the day's container, and the venue is accepted", async () => {
    // This is the part that actually recovers Prague Castle: with the
    // Changing of the Guard resolved to a real point, two members land
    // inside 300 m and the >=2 floor is met (scope §G4.3, docket §A.4d).
    const castle: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Prague Castle",
    };
    const guard: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Changing of the Guard",
    };
    const queries: string[] = [];
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: respondWith((query) => {
        queries.push(query);
        if (query === "Prague Castle, Prague") {
          return { lat: 50.0910966, lng: 14.4016165, types: ["tourist_attraction"] };
        }
        if (query === "Changing of the Guard, Prague Castle") {
          // Inside the Prague viewport the centroid response carried.
          return { lat: 50.0911, lng: 14.4004, types: ["tourist_attraction"] };
        }
        return PRAGUE_CENTROID;
      }),
      stages: [stageWith([castle, guard])],
    });

    assert.equal(result.usage.outcome, "completed");
    assert.equal(result.usage.retryCount, 1, "exactly one retry, and only one");
    assert.equal(result.usage.retryAcceptedCount, 1);
    assert.equal(guard._geoVerified, true);
    assert.equal(guard.verifiedLatitude, 50.0911);
    assert.equal(
      (guard._geoVerification as Record<string, unknown>).query,
      "Changing of the Guard, Prague Castle",
      "provenance records the query that actually resolved it"
    );
    assert.equal(
      queries.filter((query) => query.includes("Changing of the Guard")).length,
      2,
      "one standalone lookup plus exactly one container retry"
    );
    // The container itself is never retried against itself.
    assert.equal(
      queries.filter((query) => query === "Prague Castle, Prague Castle").length,
      0
    );
  });

  await test("G4.3: a retry that lands outside the day's city bounds is REFUSED — a wrong coordinate is worse than none", async () => {
    // Scope §3 failure mode 2: "Peklo, Prague" finding a different Peklo.
    // Bar item 7 rates a wrong group worse than a missing one, so this
    // predicate fails closed.
    const castle: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Prague Castle",
    };
    const peklo: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Peklo",
    };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: respondWith((query) => {
        if (query === "Peklo, Prague Castle") {
          // A real venue — in Vienna, 250 km outside the Prague viewport.
          return { lat: 48.2082, lng: 16.3738, types: ["point_of_interest"] };
        }
        if (query === "Prague Castle, Prague") {
          return { lat: 50.0910966, lng: 14.4016165, types: ["tourist_attraction"] };
        }
        return PRAGUE_CENTROID;
      }),
      stages: [stageWith([castle, peklo])],
    });

    assert.equal(result.usage.outcome, "completed");
    assert.equal(result.usage.retryCount, 1);
    assert.equal(result.usage.retryAcceptedCount, 0);
    assert.equal(result.usage.retryOutOfCityCount, 1);
    assert.equal(peklo._geoVerified, undefined, "no verified coordinate at all");
    assert.equal(peklo.verifiedLatitude, undefined);
  });

  await test("G4.3 + D3: retries count against the budget, so the cap stays a true ceiling", async () => {
    const castle: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Prague Castle",
    };
    const guard: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Changing of the Guard",
    };
    let calls = 0;
    const result = await runGeocodeVerification({
      // Budget exactly equals the candidate pool: nothing is left to spend
      // on a retry, and the telemetry says the CAP bounded recovery rather
      // than letting the guard take the blame.
      config: { ...CONFIG, maxLookups: 2 },
      fetchImpl: respondWith((query) => {
        calls += 1;
        return query === "Prague Castle, Prague"
          ? { lat: 50.0910966, lng: 14.4016165, types: ["tourist_attraction"] }
          : PRAGUE_CENTROID;
      }),
      stages: [stageWith([castle, guard])],
    });

    assert.equal(calls, 2, "the cap is a HARD ceiling including retries");
    assert.equal(result.usage.lookupCount, 2);
    assert.equal(result.usage.retryCount, 0);
    assert.equal(result.usage.retrySkippedOverBudgetCount, 1);
    assert.equal(guard._geoVerified, undefined);
  });

  await test("G4.4: every candidate carries its rank and outcome, including the ones that never got a lookup", async () => {
    // The question run 7.28.0 could not answer: St. Vitus sat on a crowded
    // day, was a same-day component of a container, eight of its twelve
    // day-mates resolved — and nobody could say why it lost its lookup,
    // because this record did not exist (docket §C, field 4).
    const castle: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Prague Castle",
    };
    const vitus: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "St. Vitus Cathedral",
    };
    const result = await runGeocodeVerification({
      config: { ...CONFIG, maxLookups: 1 },
      fetchImpl: respondWith(() => ({
        lat: 50.0910966,
        lng: 14.4016165,
        types: ["tourist_attraction"],
      })),
      stages: [stageWith([castle, vitus])],
    });

    assert.equal(result.usage.candidates.length, 2, "the POOL, not the lookups");

    // The contract is that the ledger MIRRORS the ranking ladder — not that
    // the ladder has any particular shape. Asserting a hardcoded rank here
    // would silently couple this test to the contents of
    // SITE_CONTAINER_NOUN_PATTERN, which is not what G4.4 promises.
    const ladder = selectGeocodeCandidates([stageWith([{ ...castle }, { ...vitus }])]);
    assert.deepEqual(
      result.usage.candidates.map((row) => ({ query: row.query, rank: row.rank })),
      ladder.map((entry) => ({ query: entry.query, rank: entry.rank })),
      "every candidate appears, in rank order, with the rank it was given"
    );

    const [first, second] = result.usage.candidates;
    assert.equal(first.outcome, "resolved");
    assert.equal(first.granularity, "venue");
    assert.equal(first.retried, false);
    assert.equal(
      second.outcome,
      "skipped_over_budget",
      "the answer to 'why did this stop not resolve' is now on the record"
    );
    assert.equal(second.granularity, null, "it was never looked up");
    assert.equal(
      result.usage.candidates.filter((row) => row.outcome === "resolved").length,
      1
    );
  });

  await test("G4.4: a retried candidate records the retry query and its final granularity", async () => {
    const castle: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Prague Castle",
    };
    const guard: Record<string, unknown> = {
      city: "Prague",
      date: "2019-01-16",
      itemType: "activity",
      title: "Changing of the Guard",
    };
    const result = await runGeocodeVerification({
      config: CONFIG,
      fetchImpl: respondWith((query) =>
        query === "Changing of the Guard, Prague Castle"
          ? { lat: 50.0911, lng: 14.4004, types: ["tourist_attraction"] }
          : query === "Prague Castle, Prague"
            ? { lat: 50.0910966, lng: 14.4016165, types: ["tourist_attraction"] }
            : PRAGUE_CENTROID
      ),
      stages: [stageWith([castle, guard])],
    });

    const row = result.usage.candidates.find((candidate) =>
      candidate.query.startsWith("Changing of the Guard")
    );
    if (!row) {
      throw new Error("the retried candidate is missing from the ledger");
    }
    assert.equal(row.retried, true);
    assert.equal(row.retryQuery, "Changing of the Guard, Prague Castle");
    assert.equal(row.outcome, "resolved");
    assert.equal(row.granularity, "venue");
  });

  await test("G4.3: the retry runs in its own wave, so scope §2's ceil(lookups / 8) arithmetic still holds", async () => {
    // A retry issued INLINE would cost its parent wave two sequential
    // round-trips and quietly break the 4 s-per-wave headroom arithmetic.
    // Queued into a later wave, concurrency never exceeds the configured
    // width.
    const cards = [
      {
        city: "Prague",
        date: "2019-01-16",
        itemType: "activity",
        title: "Prague Castle",
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        city: "Prague",
        date: "2019-01-16",
        itemType: "activity",
        title: `Courtyard stop ${index}`,
      })),
    ];
    let inFlight = 0;
    let peakInFlight = 0;
    const result = await runGeocodeVerification({
      // Headroom above the 10-card pool so D3 leaves something to retry
      // with; the point under test is wave WIDTH, not the cap.
      config: { ...CONFIG, maxLookups: 30 },
      fetchImpl: (async (url: string) => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        const query =
          new URL(url).searchParams.get("address") ?? "";
        return {
          ok: true,
          json: async () => ({
            results: [
              query.includes("Prague Castle") && !query.startsWith("Prague Castle")
                ? {
                    geometry: { location: { lat: 50.0911, lng: 14.4004 } },
                    types: ["tourist_attraction"],
                  }
                : PRAGUE_CENTROID_RESULT,
            ],
            status: "OK",
          }),
        } as Response;
      }) as unknown as typeof fetch,
      stages: [stageWith(cards)],
    });

    assert.ok(result.usage.retryCount > 0, "retries did happen");
    assert.ok(
      peakInFlight <= result.usage.lookupConcurrency,
      `concurrency stays at the configured width (peak ${peakInFlight})`
    );
  });
}
