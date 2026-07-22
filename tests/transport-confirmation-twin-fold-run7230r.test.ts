import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";

// Live-run 7.23.0r P1 (trip 892b2e3e, bundle sha256 419b7405…): a 9th
// transport row shipped — piece_4547a62a "Home flight FCO to JFK", JFK
// 02:45 -> FCO 10:15 on 2019-01-25, description "Delta Flight 1043
// operated by Alitalia, seat 14J", conf #GHFHPG — a garbled duplicate of
// the anchored Delta 1043 (FCO 14:45 -> JFK 18:45, #GHFHPG). Route
// reversed, times corrupted, no number field: every prior twin basis
// missed it, and transport_row_without_source_anchor stayed advisory.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function emptyStage(value: Record<string, unknown>) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...value,
  };
}

function stage(label: string, stageValue: Record<string, unknown>) {
  return { label, source: "model_chunk" as const, stage: stageValue };
}

function anchor(value: Partial<SourceTransportAnchor>): SourceTransportAnchor {
  return {
    anchorId: value.anchorId ?? "anchor",
    arrivalLocation: null,
    arrivalTime: null,
    confidence: "high",
    confirmation: null,
    date: null,
    departureLocation: null,
    departureTime: null,
    evidence: "",
    kind: "flight",
    number: null,
    provider: null,
    provenance: ["text_layer"],
    routeLabel: "",
    sourceFilename: null,
    sourceUploadId: null,
    ...value,
  } as SourceTransportAnchor;
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

type DraftRecord = Record<string, unknown>;

function transportOf(result: { draft: unknown }) {
  return ((result.draft as DraftRecord).transport ?? []) as DraftRecord[];
}

const DELTA_1043_ANCHOR = anchor({
  anchorId: "flight-2019-01-25-1043-14-45-24",
  arrivalLocation: "JFK",
  arrivalTime: "18:45",
  confirmation: "GHFHPG",
  date: "2019-01-25",
  departureLocation: "FCO",
  departureTime: "14:45",
  evidence:
    "Friday, January 25th Home Delta Flight 1043 (Operated by Alitalia) Confirmation #GHFHPG FCO -> JFK (10 hours) 14J 2:45 -> 6:45",
  number: "1043",
  provider: "Delta",
  routeLabel: "Flight from FCO to JFK",
});

const REAL_1043 = {
  title: "Delta Flight 1043",
  date: "2019-01-25",
  type: "flight",
  departureLocation: "FCO",
  arrivalLocation: "JFK",
  departureTime: "14:45",
  arrivalTime: "18:45",
  provider: "Delta",
  confirmation: "#GHFHPG",
  description: "Delta Flight 1043 (Operated by Alitalia)",
};

const PHANTOM_1043 = {
  title: "Home flight FCO to JFK",
  date: "2019-01-25",
  type: "flight",
  departureLocation: "JFK",
  arrivalLocation: "FCO",
  departureTime: "02:45",
  arrivalTime: "10:15",
  provider: "Delta",
  confirmation: "#GHFHPG",
  description: "Delta Flight 1043 operated by Alitalia, seat 14J.",
};

export default async function run() {
  await test("RW-TRV-001 (7.23.0r): the reversed-route phantom folds into its anchored confirmation twin", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [DELTA_1043_ANCHOR],
      stages: [
        stage("Friday, January 25th", emptyStage({
          transport: [REAL_1043],
        })),
        stage("source recovery", emptyStage({
          transport: [PHANTOM_1043],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const rows = transportOf(result);
    const jan25 = rows.filter((row) => row.date === "2019-01-25");
    assert.equal(
      jan25.length,
      1,
      `phantom twin shipped: ${JSON.stringify(jan25.map((row) => row.title))}`
    );
    assert.equal(jan25[0].departureTime, "14:45", "the ANCHORED row survives");
    assert.equal(jan25[0].departureLocation, "FCO");
  });

  await test("negative control: an unanchored row with a UNIQUE confirmation never folds (the Ryanair shape)", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [DELTA_1043_ANCHOR],
      stages: [
        stage("Friday, January 25th", emptyStage({
          transport: [
            REAL_1043,
            {
              title: "Ryanair FR8331 Rome Ciampino to Prague",
              date: "2019-01-14",
              type: "flight",
              departureLocation: "Rome Ciampino",
              arrivalLocation: "Prague",
              departureTime: "09:20",
              arrivalTime: "11:10",
              provider: "Ryanair",
              confirmation: "N8WBRE",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const rows = transportOf(result);
    assert.equal(rows.length, 2, `rows lost: ${JSON.stringify(rows.map((r) => r.title))}`);
  });

  await test("negative control: one booking across several segments never folds — shared confirmation with DIFFERENT endpoints survives", () => {
    // Delta 5925 (DCA->JFK) is anchored; the connecting 444 (JFK->FCO)
    // shares #GHFHPG and the same date but has no anchor of its own.
    // Endpoint pairs differ, so it must survive.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [
        anchor({
          anchorId: "flight-2019-01-12-5925-17-00-1",
          arrivalLocation: "JFK",
          arrivalTime: "18:41",
          confirmation: "GHFHPG",
          date: "2019-01-12",
          departureLocation: "DCA",
          departureTime: "17:00",
          number: "5925",
          provider: "Delta",
          routeLabel: "Flight from DCA to JFK",
        }),
      ],
      stages: [
        stage("Saturday, January 12th", emptyStage({
          transport: [
            {
              title: "Delta Flight 5925",
              date: "2019-01-12",
              type: "flight",
              departureLocation: "DCA",
              arrivalLocation: "JFK",
              departureTime: "17:00",
              arrivalTime: "18:41",
              provider: "Delta",
              confirmation: "#GHFHPG",
            },
            {
              title: "Flight from JFK to Rome",
              date: "2019-01-12",
              type: "flight",
              departureLocation: "JFK",
              arrivalLocation: "FCO",
              departureTime: "19:46",
              arrivalTime: "10:15",
              provider: "Delta",
              confirmation: "#GHFHPG",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const rows = transportOf(result);
    assert.equal(
      rows.length,
      2,
      `a legitimate connection folded: ${JSON.stringify(rows.map((r) => r.title))}`
    );
  });
}
