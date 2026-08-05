import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  normalizeParserStageArtifacts,
} from "@/lib/extraction/parser-artifact-normalization";
import { createCanonicalizationSummary } from "@/lib/extraction/trip-extraction-audit-snapshot";

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

  await test("an explicit split disjunction folds into one X-or-Y card", () => {
    const sourceText = [
      "Saturday, January 19th",
      "12:00 Modern Art Museum or Design Museum",
    ].join("\n");
    const result = normalizeParserStageArtifacts([
      stage("Saturday, January 19th", emptyStage({
        activities: [
          {
            category: "art_culture",
            date: "2019-01-19",
            itemType: "activity",
            title: "Modern Art Museum",
          },
          {
            category: "art_culture",
            date: "2019-01-19",
            itemType: "activity",
            title: "Design Museum",
          },
        ],
      }), sourceText),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].title, "Modern Art Museum or Design Museum");
    assert.match(String(activities[0].description), /Design Museum/);
    assert.equal(activities[1].evidenceRole, "context");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "disjunction_split")
        .length,
      1
    );
    const trace = result.repairs.find(
      (repair) => repair.kind === "disjunction_split"
    )?.sourceBoundedTrace;
    assert.equal(trace?.rule, "explicit_local_or_v1");
    assert.equal(trace?.beforeRoles[1], null);
    assert.equal(trace?.afterRoles[1], "context");
    assert.equal(trace?.spanHash.length, 64);
    assert.equal(
      JSON.stringify(trace).includes("Modern Art Museum"),
      false,
      "telemetry carries a span hash and range, never source prose"
    );
  });

  await test("four production-source explicit alternatives remain bounded and repairable", () => {
    const cases = [
      ["Try Onion Soup or Garlic Soup.", "Onion Soup", "Garlic Soup"],
      [
        "Have lunch at Pest-Buda Bistro or Cafe Pierrot.",
        "Pest-Buda Bistro",
        "Cafe Pierrot",
      ],
      [
        "Castle District: Balthazar or Pest-Buda Bistro, Pest: Zona.",
        "Balthazar",
        "Pest-Buda Bistro",
      ],
      [
        "Pest: Pomodoro or Menza, Buda: Zona.",
        "Pomodoro",
        "Menza",
      ],
    ] as const;

    for (const [sourceText, leftTitle, rightTitle] of cases) {
      const result = normalizeParserStageArtifacts([
        stage(
          "Source-authored alternative",
          emptyStage({
            activities: [
              {
                category: "food_dining",
                date: "2019-01-22",
                itemType: "activity",
                title: leftTitle,
              },
              {
                category: "food_dining",
                date: "2019-01-22",
                itemType: "activity",
                title: rightTitle,
              },
            ],
          }),
          sourceText
        ),
      ]);
      const activities = firstStage(result).activities;
      assert.equal(activities[0]?.title, `${leftTitle} or ${rightTitle}`);
      assert.equal(activities[1]?.evidenceRole, "context");
      assert.equal(
        result.repairs.filter((repair) => repair.kind === "disjunction_split")
          .length,
        1
      );
    }
  });

  await test("flattened Rome source cannot fuse Colosseum with The Yellow", () => {
    const sourceText =
      "2:00 PM Colosseum 30 minute walk Pantheon Trevi Fountain Spanish Steps to Hostel -> 30 minute walk or 10 minute metro Sleeping: The Yellow Check in 2:30 PM";
    const result = normalizeParserStageArtifacts([
      stage(
        "Flattened Rome PDF text",
        emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-13",
              itemType: "activity",
              title: "Colosseum",
            },
            {
              category: "admin_logistics",
              date: "2019-01-13",
              itemType: "activity",
              title: "The Yellow",
            },
          ],
        }),
        sourceText
      ),
    ]);
    const activities = firstStage(result).activities;
    assert.equal(activities[0]?.title, "Colosseum");
    assert.equal(activities[1]?.title, "The Yellow");
    assert.equal(result.repairs.some((repair) => repair.kind === "disjunction_split"), false);
  });

  await test("flattened Vienna source cannot fuse Palm House with Museum of Illusions", () => {
    const sourceText =
      "Palm house at Schonbrunn free 6 Apple Strudel Show Panorama Train Buy wine cheap by the glass units are 1/8 or 1/4 liter ochtel versus fiertl Museum of Illusions Mozarthaus";
    const result = normalizeParserStageArtifacts([
      stage(
        "Flattened Vienna PDF text",
        emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-19",
              itemType: "activity",
              title: "Palm House",
            },
            {
              category: "art_culture",
              date: "2019-01-19",
              itemType: "activity",
              title: "Museum of Illusions",
            },
          ],
        }),
        sourceText
      ),
    ]);
    const activities = firstStage(result).activities;
    assert.equal(activities[0]?.title, "Palm House");
    assert.equal(activities[1]?.title, "Museum of Illusions");
    assert.equal(result.repairs.some((repair) => repair.kind === "disjunction_split"), false);
  });

  await test("served disjunction telemetry links the bounded rule to observations and pieces", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Bounded alternative telemetry",
          emptyStage({
            activities: [
              {
                _resolverCandidateId: "candidate-left",
                category: "food_dining",
                city: "Budapest",
                date: "2019-01-22",
                itemType: "activity",
                title: "Pest-Buda Bistro",
              },
              {
                _resolverCandidateId: "candidate-right",
                category: "food_dining",
                city: "Budapest",
                date: "2019-01-22",
                itemType: "activity",
                title: "Cafe Pierrot",
              },
            ],
            places: [
              {
                arriveDate: "2019-01-21",
                city: "Budapest",
                leaveDate: "2019-01-24",
              },
            ],
          }),
          "Have lunch at Pest-Buda Bistro or Cafe Pierrot."
        ),
      ],
      tripOverview: { dateRange: "January 21-24, 2019" },
    });
    const telemetry = result.summary.sourceBoundedDisjunctionRepairs;
    assert.equal(telemetry.length, 1);
    assert.equal(telemetry[0]?.rule, "explicit_local_or_v1");
    assert.equal(telemetry[0]?.observationIds.length, 2);
    assert.ok((telemetry[0]?.canonicalPieceIds.length ?? 0) >= 1);
    assert.equal(telemetry[0]?.beforeRoles[1], null);
    assert.equal(telemetry[0]?.afterRoles[1], "context");
    const served = createCanonicalizationSummary({
      openai: { evidence: result.summary },
    });
    assert.deepEqual(served.sourceBoundedDisjunctionRepairs, telemetry);
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

  await test("run6 PB-5: provider short-token shards strip ('Za Wizz Air' -> 'Wizz Air'); number-shaped providers null ('D 143')", () => {
    const result = normalizeParserStageArtifacts([
      stage("budapest-travel", emptyStage({
        transport: [
          {
            date: "2019-01-24",
            provider: "Za Wizz Air",
            title: "Budapest to Rome",
            type: "flight",
          },
          {
            date: "2019-01-21",
            provider: "D 143",
            title: "Vienna to Budapest",
            type: "train",
          },
          {
            date: "2019-01-12",
            provider: "PM Delta",
            title: "JFK to Rome",
            type: "flight",
          },
        ],
      })),
    ]);
    const transport = firstStage(result).transport;

    assert.equal(transport[0].provider, "Wizz Air");
    assert.equal(transport[1].provider, null);
    assert.equal(transport[2].provider, "Delta");
    assert.ok(
      result.repairs.filter((repair) => repair.kind === "provider_text_bleed")
        .length >= 3
    );
  });

  await test("run6 rider: a lodging cost note with a bare currency code still demotes (Prague lodging cost note, 45.75 EUR)", () => {
    const result = normalizeParserStageArtifacts([
      stage("prague-notes", emptyStage({
        activities: [
          {
            category: "admin_logistics",
            city: "Prague",
            date: "2019-01-14",
            description: "45.75 EUR paid deposit via booking.",
            itemType: "activity",
            title: "Prague lodging cost note",
          },
        ],
      })),
    ]);
    const activities = firstStage(result).activities;

    assert.equal(activities[0].evidenceRole, "context");
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "cost_line_card").length,
      1
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
