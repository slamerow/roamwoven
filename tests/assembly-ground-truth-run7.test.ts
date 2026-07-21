import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { selectGeocodeCandidates } from "@/lib/extraction/geocode-verification";

// Live-run 7.21.0 (planned "7.18.4", trip d45bb01b, run eb5cb832) regression
// fixtures — Arc C. Shapes are drawn from the run's audit payload
// (run-7.21.0-audit-payload lineage), not invented.

function activity({
  category = "art_culture",
  city = null as string | null,
  date = "2019-01-22",
  description = null as string | null,
  lat = null as number | null,
  lng = null as number | null,
  startTime = null as string | null,
  title,
  extra = {} as Record<string, unknown>,
}: {
  category?: string;
  city?: string | null;
  date?: string;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  startTime?: string | null;
  title: string;
  extra?: Record<string, unknown>;
}) {
  return {
    address: null,
    approxLatitude: lat,
    approxLongitude: lng,
    category,
    city,
    date,
    description,
    endTime: null,
    itemType: "activity",
    sourceFilename: "czech-out.pdf",
    startTime,
    title,
    ...extra,
  };
}

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: `${label}.txt`,
    stage: value,
  };
}

function emptyStage(overrides: Record<string, unknown> = {}) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...overrides,
  };
}

export default async function run() {
  const { test } = await import("node:test");

  await test("run7 PC-2: fabricated parser coordinates cannot mint a same-site mega-container once the geocode lane ran", () => {
    // The live shape: gpt-5.4-mini emitted ~one point (47.497/19.040) at
    // 3-decimal precision for the whole guided day; "Gresham Palace" (own
    // description: "Take a peek inside…") claimed 6 stops "within 300 m",
    // including the TIMED Chain Bridge crossing and Buda Castle — another
    // site container across the river.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-22",
          emptyStage({
            activities: [
              activity({
                title: "Gresham Palace",
                description:
                  "Take a peek inside the Four Seasons Hotel / Gresham Palace.",
                lat: 47.497,
                lng: 19.039,
              }),
              activity({
                title: "Szechenyi Chain Bridge",
                description: "Walk across the Szechenyi Chain Bridge.",
                startTime: "11:00",
                lat: 47.499,
                lng: 19.041,
              }),
              activity({
                title: "St. Istvan's Basilica",
                description: "Tour St. Istvan's Basilica.",
                lat: 47.498,
                lng: 19.04,
              }),
              activity({
                title: "Shoes on the Danube",
                description: "Visit Shoes on the Danube memorial.",
                lat: 47.496,
                lng: 19.04,
              }),
              activity({
                title: "Parliament",
                description: "Take a tour of Parliament.",
                lat: 47.497,
                lng: 19.042,
              }),
              activity({
                title: "Buda Castle",
                description: "Buda Castle national history museum.",
                lat: 47.498,
                lng: 19.039,
              }),
              // One lane-verified piece elsewhere in the build marks the
              // lane as having run — radius rules must then require
              // verified coordinates, which none of the members carry.
              activity({
                title: "Fisherman's Bastion",
                startTime: "09:00",
                lat: 47.504,
                lng: 19.025,
                extra: {
                  _geoVerified: true,
                  verifiedLatitude: 47.5022,
                  verifiedLongitude: 19.0348,
                },
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const parented = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.equal(
      parented.length,
      0,
      "no member joins a same-site visit on fabricated parser coordinates"
    );
    const groupingCall = draft.missingDetails.find(
      (item) =>
        item._canonicalReviewDisposition === "call" &&
        /included stop/i.test(String(item.prompt ?? ""))
    );
    assert.equal(groupingCall, undefined, "no grouping call is minted");
  });

  await test("run7 PC-2: a passing-mention description disqualifies a container even lane-off", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-22-off",
          emptyStage({
            activities: [
              activity({
                title: "Gresham Palace",
                description:
                  "Take a peek inside the Four Seasons Hotel / Gresham Palace.",
                lat: 47.4989,
                lng: 19.0459,
              }),
              activity({
                title: "St. Istvan's Basilica",
                lat: 47.4987,
                lng: 19.0461,
              }),
              activity({
                title: "Vorosmarty Ter",
                lat: 47.4985,
                lng: 19.0458,
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    assert.equal(
      draft.activities.filter((item) => item._canonicalParentPieceId).length,
      0,
      "a 'take a peek inside' card never owns a visit"
    );
  });

  await test("run7 PC-2: verified coordinates still group a true same-site visit when the lane ran", () => {
    const verified = (lat: number, lng: number) => ({
      _geoVerified: true,
      verifiedLatitude: lat,
      verifiedLongitude: lng,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-19",
          emptyStage({
            activities: [
              activity({
                title: "Schönbrunn Palace",
                date: "2019-01-19",
                description: "Schönbrunn Palace visit.",
                lat: 48.184,
                lng: 16.312,
                extra: verified(48.1845, 16.3122),
              }),
              activity({
                title: "Gloriette",
                date: "2019-01-19",
                lat: 48.183,
                lng: 16.311,
                extra: verified(48.1832, 16.3111),
              }),
              activity({
                title: "Palm House at Schönbrunn",
                date: "2019-01-19",
                lat: 48.185,
                lng: 16.303,
                extra: verified(48.1852, 16.3033),
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const parent = draft.activities.find(
      (item) => String(item.title) === "Schönbrunn Palace"
    );
    const kids = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.ok(parent, "the palace container survives");
    assert.equal(kids.length, 2, "both verified stops join the visit");
  });

  await test("run7 geocode lane: site containers and crowded-day members are verified even with precise-looking parser coordinates", () => {
    const day = "2019-01-22";
    const member = (title: string) => ({
      approxLatitude: 47.497,
      approxLongitude: 19.04,
      date: day,
      itemType: "activity",
      title,
    });
    const stages = [
      {
        label: "jan-22",
        source: "model_chunk",
        sourceFilename: "jan-22.txt",
        stage: {
          activities: [
            member("Gresham Palace"),
            member("Szechenyi Chain Bridge"),
            member("St. Istvan's Basilica"),
            member("Shoes on the Danube"),
            member("Parliament"),
            member("Buda Castle"),
            // Rank-2 background record with precise coords: still skipped.
            {
              approxLatitude: 41.8902,
              approxLongitude: 12.4922,
              date: "2019-01-13",
              itemType: "activity",
              title: "Colosseum",
            },
          ],
          missingDetails: [],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
        },
      },
    ] as EvidenceStageInput[];
    const candidates = selectGeocodeCandidates(stages);
    const titles = candidates.map((candidate) => candidate.query);
    assert.ok(
      titles.some((query) => /gresham/i.test(query)),
      "the site container is a lookup candidate despite precise parser coords"
    );
    assert.ok(
      titles.some((query) => /parliament/i.test(query)),
      "crowded-day members are lookup candidates despite precise parser coords"
    );
    assert.ok(
      !titles.some((query) => /colosseum/i.test(query)),
      "background records with precise parser coords still skip the budget"
    );
  });

  await test("run7 walk rules: source-narrated routes and tours never re-parent into a discovered walk", () => {
    const located = (
      title: string,
      description: string | null,
      extra: Record<string, unknown> = {}
    ) =>
      activity({
        title,
        date: "2019-01-14",
        description,
        lat: 50.087,
        lng: 14.42,
        extra: { area: "Old Town", sourceSectionLabel: "Monday, January 14th Old Town", ...extra },
      });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-14",
          emptyStage({
            activities: [
              located("Charles Bridge", "Walk across Charles Bridge."),
              located(
                "Astronomical Clock",
                "Stop by the astronomical clock on the hour."
              ),
              located("Lucerna Arcade", "Visit Lucerna Arcade near Wenceslas Square."),
              located("Dancing House", "Walk by the Dancing House."),
              located("Catacombs tour", "Catacombs tour.", {
                category: "tours_tickets",
              }),
              located("Hemingway Bar", "Hemingway Bar at 6:00 PM.", {
                category: "food_dining",
                startTime: "18:00",
              }),
              located("Museum of Communism", "Visit the Museum of Communism."),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const walkCall = draft.missingDetails.find(
      (item) =>
        item._canonicalReviewDisposition === "call" &&
        /discovered walk/i.test(String(item.reason ?? item.prompt ?? ""))
    );
    assert.equal(
      walkCall,
      undefined,
      "the source-narrated Jan-14 evening route ships ungrouped (approved answer key)"
    );
    const catacombs = draft.activities.find((item) =>
      /catacombs/i.test(String(item.title))
    );
    assert.ok(catacombs, "the catacombs tour survives standalone");
    assert.equal(
      catacombs._canonicalParentPieceId ?? null,
      null,
      "a tour is never a walk stop"
    );
  });
}
