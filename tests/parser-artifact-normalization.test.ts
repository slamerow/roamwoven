import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  normalizeParserStageArtifacts,
} from "@/lib/extraction/parser-artifact-normalization";

// Wave-2 parser-artifact fixtures from LIVE runs 7.18.0 and 7.18.1
// (docs/assembly-defect-docket-2026-07-17-run3.md addendum,
// docs/assembly-defect-docket-2026-07-18-run4.md). Input shapes mirror what
// the live parser emitted in those runs.

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

function stage(
  label: string,
  stageValue: Record<string, unknown>,
  sourceText?: string
) {
  return {
    label,
    source: "model_chunk" as const,
    sourceText: sourceText ?? null,
    stage: stageValue,
  };
}

type StageRecord = {
  activities: Array<Record<string, unknown>>;
  transport: Array<Record<string, unknown>>;
};

function firstStage(result: ReturnType<typeof normalizeParserStageArtifacts>) {
  return result.stages[0].stage as StageRecord;
}

export default async function run() {
  await test("degenerate endTime equal to startTime is cleared (Borkonyha 20:00-20:00)", () => {
    const result = normalizeParserStageArtifacts([
      stage("Tuesday, January 22nd", emptyStage({
        activities: [
          {
            category: "food_dining",
            date: "2019-01-22",
            endTime: "20:00",
            itemType: "activity",
            startTime: "20:00",
            title: "Borkonyha dinner",
          },
        ],
      })),
    ]);

    assert.equal(firstStage(result).activities[0].endTime, null);
    assert.equal(firstStage(result).activities[0].startTime, "20:00");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "degenerate_end_time")
        .length,
      1
    );
  });

  await test("bare opening-hours endTime clears for sightseeing but a real deadline survives (Mumok 19:00 vs car return 20:00)", () => {
    const result = normalizeParserStageArtifacts([
      stage("Saturday, January 19th", emptyStage({
        activities: [
          {
            category: "art_culture",
            date: "2019-01-19",
            endTime: "19:00",
            itemType: "activity",
            startTime: null,
            title: "Mumok",
          },
          {
            category: "arrival_departure",
            date: "2019-01-17",
            description: "Return the car at the same location at 20:00.",
            endTime: "20:00",
            itemType: "activity",
            startTime: null,
            title: "Car return",
          },
        ],
      })),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].endTime, null);
    assert.equal(activities[1].endTime, "20:00");
  });

  await test("provider text-bleed strips layout words (PM Delta, Home Delta)", () => {
    const result = normalizeParserStageArtifacts([
      stage("Saturday, January 12th", emptyStage({
        transport: [
          {
            date: "2019-01-12",
            provider: "PM Delta",
            title: "Flight to Prague",
            type: "flight",
          },
          {
            date: "2019-01-25",
            provider: "Home Delta",
            title: "Flight home",
            type: "flight",
          },
        ],
      })),
    ]);
    const transport = firstStage(result).transport;

    assert.equal(transport[0].provider, "Delta");
    assert.equal(transport[1].provider, "Delta");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "provider_text_bleed")
        .length,
      2
    );
  });

  await test("a carrier the source does not name is scrubbed from title and provider (Ryanair FR8331 mislabeled Delta)", () => {
    const ryanairTicket = [
      "Ryanair Boarding Pass",
      "FR8331 Budapest BUD to Rome Ciampino CIA",
      "Departure 09:50 Arrival 11:20",
    ].join("\n");
    const result = normalizeParserStageArtifacts([
      stage("ryanair-ticket.pdf", emptyStage({
        transport: [
          {
            date: "2019-01-23",
            provider: "Delta",
            title: "Delta flight FR8331",
            type: "flight",
          },
        ],
      }), ryanairTicket),
    ]);
    const transport = firstStage(result).transport;

    assert.equal(transport[0].provider, null);
    assert.equal(transport[0].title, "Flight FR8331");
    assert.ok(
      result.repairs.some(
        (repair) => repair.kind === "carrier_without_source_support"
      )
    );
  });

  await test("a source-named carrier keeps its title and provider (negative control)", () => {
    const deltaSource = [
      "Saturday, January 12th",
      "Delta flight DL5925 departs 5:00 PM arrives 6:41 PM",
    ].join("\n");
    const result = normalizeParserStageArtifacts([
      stage("Saturday, January 12th", emptyStage({
        transport: [
          {
            date: "2019-01-12",
            provider: "Delta",
            title: "Delta flight DL5925",
            type: "flight",
          },
        ],
      }), deltaSource),
    ]);
    const transport = firstStage(result).transport;

    assert.equal(transport[0].provider, "Delta");
    assert.equal(transport[0].title, "Delta flight DL5925");
  });

  await test("a day-title card demotes to context (We Explore Budapest) while a venue from a multi-part heading survives (Prague Castle)", () => {
    const result = normalizeParserStageArtifacts([
      stage("Thursday, January 23rd // We Explore Budapest", emptyStage({
        activities: [
          {
            category: "art_culture",
            date: "2019-01-23",
            itemType: "activity",
            title: "We Explore Budapest",
          },
        ],
      })),
      stage("Wednesday, January 16th // Lesser Town & Prague Castle", emptyStage({
        activities: [
          {
            category: "tours_tickets",
            date: "2019-01-16",
            itemType: "activity",
            title: "Prague Castle",
          },
        ],
      })),
    ]);
    const budapest = (result.stages[0].stage as StageRecord).activities[0];
    const castle = (result.stages[1].stage as StageRecord).activities[0];

    assert.equal(budapest.evidenceRole, "context");
    assert.equal(castle.evidenceRole, undefined);
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "day_title_card").length,
      1
    );
  });

  await test("a slash-separated day-title fragment demotes (Walking tour / Jewish History / Old Town free time)", () => {
    const result = normalizeParserStageArtifacts([
      stage(
        "Tuesday, January 15th // Walking tour / Jewish History / Old Town free time",
        emptyStage({
          activities: [
            {
              category: "tours_tickets",
              date: "2019-01-15",
              itemType: "activity",
              title: "Walking tour / Jewish History / Old Town free time",
            },
            {
              category: "tours_tickets",
              date: "2019-01-15",
              itemType: "activity",
              startTime: "9:00 AM",
              title: "Prague walking tour",
            },
          ],
        })
      ),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].evidenceRole, "context");
    assert.equal(activities[1].evidenceRole, undefined);
  });

  await test("a standalone cost-line card demotes (Vienna lodging note $72) while a priced venue card survives", () => {
    const result = normalizeParserStageArtifacts([
      stage("Friday, January 18th", emptyStage({
        activities: [
          {
            category: "admin_logistics",
            city: "Vienna",
            date: "2019-01-18",
            description: "$72 (private room—ensuite)",
            itemType: "activity",
            title: "Vienna lodging note",
          },
          {
            category: "food_dining",
            city: "Vienna",
            date: "2019-01-18",
            description: "Tasting menu around $50.",
            itemType: "activity",
            title: "Dinner at Borkonyha",
          },
        ],
      })),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].evidenceRole, "context");
    assert.equal(activities[1].evidenceRole, undefined);
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "cost_line_card").length,
      1
    );
  });

  await test("a split disjunction folds into one X-or-Y card (Mumok or Natural History)", () => {
    const sourceText = [
      "Saturday, January 19th",
      "12:00 Mumok or Natural history museum",
    ].join("\n");
    const result = normalizeParserStageArtifacts([
      stage("Saturday, January 19th", emptyStage({
        activities: [
          {
            category: "art_culture",
            date: "2019-01-19",
            itemType: "activity",
            title: "Mumok",
          },
          {
            category: "art_culture",
            date: "2019-01-19",
            itemType: "activity",
            title: "Natural History Museum",
          },
        ],
      }), sourceText),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].title, "Mumok or Natural History Museum");
    assert.match(String(activities[0].description), /Natural History Museum/);
    assert.equal(activities[1].evidenceRole, "context");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "disjunction_split")
        .length,
      1
    );
  });

  await test("an existing or-carrying copy leaves the wave-1.1 assembly fold in charge (lunch disjunction)", () => {
    const sourceText = [
      "Tuesday, January 22nd",
      "Have lunch in Buda at Pest-Buda bistro or Cafe Pierrot",
    ].join("\n");
    const result = normalizeParserStageArtifacts([
      stage("Tuesday, January 22nd", emptyStage({
        activities: [
          {
            category: "food_dining",
            date: "2019-01-22",
            description: "Lunch at Pest-Buda Bistro or Cafe Pierrot.",
            itemType: "activity",
            title: "Lunch in Buda",
          },
          {
            category: "food_dining",
            date: "2019-01-22",
            itemType: "activity",
            title: "Pest-Buda Bistro",
          },
          {
            category: "food_dining",
            date: "2019-01-22",
            itemType: "activity",
            title: "Cafe Pierrot",
          },
        ],
      }), sourceText),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].title, "Lunch in Buda");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "disjunction_split")
        .length,
      0
    );
  });

  await test("a ticket-page transport re-emission demotes to accessory evidence (RegioJet booking codes on Jan 24)", () => {
    const result = normalizeParserStageArtifacts([
      stage("regiojet-ticket.pdf", emptyStage({
        activities: [
          {
            category: "arrival_departure",
            date: "2019-01-24",
            description:
              "Fri, 18 Jan 2019 09:20 Prague to Vienna. Booking number 1beb5005; travel code 0468406277; seat 4/11.",
            itemType: "activity",
            sourceSectionType: "booking_detail",
            title: "Train to Budapest",
          },
        ],
      })),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].evidenceRole, "accessory_detail");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "ticket_page_activity")
        .length,
      1
    );
  });

  await test("an activity-shaped ticket-page card (Skip the Line, quantity/price/ticket number) demotes to accessory evidence", () => {
    const result = normalizeParserStageArtifacts([
      stage("prague-castle-ticket.pdf", emptyStage({
        activities: [
          {
            category: "sightseeing",
            date: "2019-01-15",
            description: "1 x 380.00 K\u010d, ticket number 19183727.",
            itemType: "activity",
            title: "Skip the Line ticket",
          },
        ],
      })),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].evidenceRole, "accessory_detail");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "ticket_page_activity")
        .length,
      1
    );
  });

  await test("a ticket-titled card naming a real venue keeps its activity role", () => {
    const result = normalizeParserStageArtifacts([
      stage("day-plan.pdf", emptyStage({
        activities: [
          {
            category: "sightseeing",
            date: "2019-01-15",
            description: "Buy the circuit B ticket at the gate, 1 x 250 CZK.",
            itemType: "activity",
            title: "Prague Castle ticket",
          },
        ],
      })),
    ]);
    const activities = firstStage(result).activities;

    assert.notEqual(activities[0].evidenceRole, "accessory_detail");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "ticket_page_activity")
        .length,
      0
    );
  });

  await test("integration: normalized artifacts never surface as traveler cards through clustering", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Thursday, January 23rd // We Explore Budapest", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-23",
              itemType: "activity",
              title: "We Explore Budapest",
            },
            {
              category: "art_culture",
              date: "2019-01-23",
              itemType: "activity",
              startTime: "10:00",
              title: "Great Market Hall",
            },
          ],
        })),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };

    assert.equal(
      draft.activities.some((item) => item.title === "We Explore Budapest"),
      false
    );
    assert.equal(
      draft.activities.some((item) => item.title === "Great Market Hall"),
      true
    );
    assert.equal(result.summary.parserArtifactRepairCount, 1);
    assert.equal(result.parserArtifactRepairs[0]?.kind, "day_title_card");
  });
}
