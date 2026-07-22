import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Live-run 7.23.0r P0 (trip 892b2e3e, bundle sha256 419b7405…): the ÖBB
// ticket code "2 159 1990 1842 0436" shipped in PUBLIC activity prose while
// the privacy layer gated the same value behind traveler_password, and two
// cards carried the traveler's name in public prose ("Client: Eli J
// Kamerow", "GOEURO … Passenger and Ticket Details Eli Kamerow"). These
// fixtures reproduce the exact live shapes and prove the output-boundary
// sweep both directions.

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

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

type DraftRecord = Record<string, unknown>;

function activitiesOf(result: { draft: unknown }) {
  return ((result.draft as DraftRecord).activities ?? []) as DraftRecord[];
}

function transportOf(result: { draft: unknown }) {
  return ((result.draft as DraftRecord).transport ?? []) as DraftRecord[];
}

function textOf(record: DraftRecord | undefined) {
  return [record?.title, record?.description]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export default async function run() {
  await test("RW-PRI-001 (7.23.0r P0): sensitive-detail ticket/booking codes never survive in public activity prose", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("source recovery", emptyStage({
          activities: [
            {
              title: "ÖBB ticket",
              date: "2019-01-24",
              category: "arrival_departure",
              description:
                "VAT: AT 10,00% — EUR 0,91 Stops: CO₂ savings: 52,4 kg Ticketcode: 2 159 1990 1842 0436 In Österreich akzeptieren wir Ihr PDF-Ticket digital.",
            },
          ],
          sensitiveDetails: [
            {
              title:
                "ÖBB train ticket code 2 159 1990 1842 0436 / booking 0648 7232 0822 6278",
              detailType: "travel_confirmation",
              reason: "Ticket/booking codes shown in source.",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const card = activitiesOf(result).find(
      (record) => record.title === "ÖBB ticket"
    );
    // The card may or may not survive later junk folds; if any copy of the
    // prose ships, it must be code-free.
    for (const record of activitiesOf(result)) {
      const text = textOf(record);
      assert.ok(
        !text.includes("2 159 1990 1842 0436"),
        `ticket code leaked into public prose: ${text}`
      );
      assert.ok(
        !text.includes("0648 7232 0822 6278"),
        `booking code leaked into public prose: ${text}`
      );
    }
    if (card) {
      // Non-protected ticket prose survives — the sweep is a redaction,
      // not a card deletion.
      assert.ok(textOf(card).includes("PDF-Ticket"));
    }
  });

  await test("RW-PRI-001 (7.23.0r P0): booking-field personal names are redacted from public prose", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("source recovery", emptyStage({
          activities: [
            {
              title: "Client",
              date: "2019-01-15",
              category: "tours_tickets",
              description: "Client: Eli J Kamerow",
            },
            {
              title: "GoEuro ticket",
              date: "2019-01-24",
              category: "arrival_departure",
              description:
                "GOEURO STEWARD ON BOARD Passenger and Ticket Details Eli Kamerow Total (Tax Included) 32.00 € goeuro.com/contact",
            },
            {
              title: "Reservation note",
              date: "2019-01-15",
              category: "tours_tickets",
              description: "Reserved by: Kamerow, Eli",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    for (const record of activitiesOf(result)) {
      const text = textOf(record);
      assert.ok(
        !/kamerow/i.test(text),
        `personal name leaked into public prose: ${text}`
      );
    }
    const goEuro = activitiesOf(result).find(
      (record) => record.title === "GoEuro ticket"
    );
    if (goEuro) {
      assert.ok(textOf(goEuro).includes("32.00"), "non-name prose must survive");
    }
  });

  await test("negative controls: flight codes, ISO dates, ordinary 'client' prose, and transport route text survive", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 14th", emptyStage({
          activities: [
            {
              title: "Breakfast at Cafe Central",
              date: "2019-01-20",
              category: "food_dining",
              description:
                "Client meetings happen here all the time. Reopens 2019-01-25.",
            },
          ],
          transport: [
            {
              title: "Ryanair FR8331 Rome Ciampino to Prague",
              date: "2019-01-14",
              type: "flight",
              departureLocation: "Rome Ciampino",
              arrivalLocation: "Prague",
              departureTime: "09:20",
              arrivalTime: "11:10",
              description:
                "Ryanair FR8331 Rome Ciampino to Prague. Seat 2D. Duration 1 hour 50 minutes. Confirmation N8WBRE.",
              confirmation: "N8WBRE",
            },
          ],
          sensitiveDetails: [
            {
              title: "Ryanair FR8331 confirmation N8WBRE",
              detailType: "travel_confirmation",
              reason: "Confirmation shown in source.",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const breakfast = activitiesOf(result).find(
      (record) => record.title === "Breakfast at Cafe Central"
    );
    assert.ok(breakfast, "breakfast card must survive");
    const breakfastText = textOf(breakfast);
    assert.ok(
      breakfastText.includes("Client meetings happen here"),
      `ordinary prose was mangled: ${breakfastText}`
    );
    assert.ok(
      breakfastText.includes("2019-01-25"),
      "ISO dates are not protected tokens"
    );

    const ryanair = transportOf(result).find((record) =>
      String(record.title ?? "").includes("FR8331")
    );
    assert.ok(ryanair, "transport row must survive");
    const ryanairText = textOf(ryanair);
    assert.ok(
      ryanairText.includes("FR8331"),
      "flight codes are public route identity, never swept"
    );
    assert.ok(
      !ryanairText.includes("N8WBRE"),
      `confirmation code leaked in transport description: ${ryanairText}`
    );
  });
}
