import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";

// Arc F.2 C2 — run 7.24.1 chain A, fixture assertion 4. The 9th transport
// row ("Train ticket", Jan 24, null→null, departureTime 10:42 — a second
// reading of the ÖBB FAHRSCHEIN OCR block with a wrong date) is quoted
// verbatim from the run's QA bundle. A transport row with neither endpoint
// location and no matching source anchor is booking material, not a
// traveler travel row; its captured confirmation still feeds the
// protected-value deny list.

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return { label, source: "model_chunk", stage: value };
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

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
  transport: Array<Record<string, unknown>>;
};

const PLACES = [
  {
    arriveDate: "2019-01-18",
    city: "Vienna",
    country: "Austria",
    leaveDate: "2019-01-21",
  },
  {
    arriveDate: "2019-01-21",
    city: "Budapest",
    country: "Hungary",
    leaveDate: "2019-01-24",
  },
];

// The live 7.24.1 fragment shape, verbatim fields.
const CHAIN_A_FRAGMENT = {
  confirmationLabel: "0648 7232 0822 6278",
  date: "2019-01-24",
  departureTime: "10:42",
  title: "Train ticket",
  type: "train",
};

const REAL_OBB_ROW = {
  arrival: "Budapest",
  arrivalTime: "13:19",
  date: "2019-01-21",
  departure: "Vienna",
  departureTime: "10:42",
  provider: "OBB",
  title: "Vienna to Budapest",
  type: "train",
};

function anchorBase(overrides: Partial<SourceTransportAnchor>): SourceTransportAnchor {
  return {
    anchorId: "anchor-test",
    arrivalLocation: null,
    arrivalTime: null,
    confidence: "high",
    confirmation: null,
    date: null,
    departureLocation: null,
    departureTime: null,
    evidence: "FAHRSCHEIN",
    kind: "train",
    number: null,
    provider: null,
    provenance: ["ocr"],
    routeLabel: "Train ticket",
    sourceFilename: null,
    sourceUploadId: null,
    ...overrides,
  };
}

export default async function run() {
  test("chain A: the endpoint-less unanchored fragment fails transport candidacy; real rows survive", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Monday, January 21st",
          emptyStage({
            places: PLACES,
            transport: [
              REAL_OBB_ROW,
              CHAIN_A_FRAGMENT,
              {
                // Negative control: real endpoints, null confirmation
                // (the live Delta 2934 shape) must survive the floor.
                arrival: "New York JFK",
                confirmation: null,
                date: "2019-01-25",
                departure: "Budapest",
                departureTime: "06:00",
                provider: "Delta",
                title: "Delta 2934",
                type: "flight",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.transport.some((row) =>
        /^train ticket$/i.test(`${row.title ?? ""}`)
      ),
      false,
      "the endpoint-less fragment does not ship as a travel row"
    );
    assert.equal(
      draft.transport.some((row) => /vienna to budapest/i.test(`${row.title ?? ""}`)),
      true,
      "the real ÖBB segment keeps shipping"
    );
    assert.equal(
      draft.transport.some((row) => /delta 2934/i.test(`${row.title ?? ""}`)),
      true,
      "real endpoints with a null confirmation survive (Delta 2934 control)"
    );

    // The suppression is a disposition, not a deletion: the piece stays in
    // lineage with the floor's auditable reason.
    const suppressed = result.pieces.find((piece) =>
      piece.actions.some((action) =>
        /transport candidacy floor/.test(action.reason)
      )
    );
    assert.ok(suppressed, "the floor records an auditable booking-material disposition");
    assert.equal(suppressed?.outputEligible, false);
  });

  test("missing arrival time alone never trips the floor", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Monday, January 21st",
          emptyStage({
            places: PLACES,
            transport: [
              {
                ...REAL_OBB_ROW,
                arrivalTime: null,
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.transport.some((row) => /vienna to budapest/i.test(`${row.title ?? ""}`)),
      true,
      "a row with endpoints but no arrival time keeps shipping"
    );
  });

  test("an endpoint-less row whose identity matches a source anchor survives the floor", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [
        anchorBase({
          arrivalTime: "13:19",
          date: "2019-01-21",
          departureTime: "10:42",
        }),
      ],
      stages: [
        stage(
          "Monday, January 21st",
          emptyStage({
            places: PLACES,
            transport: [
              {
                arrivalTime: "13:19",
                date: "2019-01-21",
                departureTime: "10:42",
                title: "Train ticket",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.transport.length,
      1,
      "the anchored endpoint-less row keeps shipping (the anchor owns its endpoints)"
    );
  });

  test("the suppressed fragment's confirmation still feeds the deny list and is swept from public prose", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Thursday, January 24th",
          emptyStage({
            places: PLACES,
            activities: [
              {
                city: "Budapest",
                date: "2019-01-24",
                // The OCR block resurfacing in public prose — the exact
                // hazard the deny-list feed exists for.
                description:
                  "Keep ticket 0648 7232 0822 6278 handy for the conductor.",
                itemType: "note",
                sourceSectionLabel: "Budapest tips",
                title: "Budapest ideas",
              },
            ],
            transport: [REAL_OBB_ROW, CHAIN_A_FRAGMENT],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const publicProse = draft.activities
      .map((item) => `${item.title ?? ""} ${item.description ?? ""}`)
      .join(" ");

    assert.equal(
      /0648\s*7232\s*0822\s*6278/.test(publicProse),
      false,
      "the suppressed fragment's captured code is deny-listed out of public prose"
    );
  });
}
