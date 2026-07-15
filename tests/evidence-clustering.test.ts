import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function activity({
  date = "2030-04-12",
  description = null,
  sourceFilename,
  startTime = null,
  title,
}: {
  date?: string;
  description?: string | null;
  sourceFilename: string;
  startTime?: string | null;
  title: string;
}) {
  return {
    address: null,
    category: "food_dining",
    city: "Sample City",
    date,
    description,
    endTime: null,
    itemType: "activity",
    sourceFilename,
    startTime,
    title,
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

function anchor(overrides: Partial<SourceTransportAnchor>): SourceTransportAnchor {
  return {
    anchorId: "anchor-1",
    arrivalLocation: null,
    arrivalTime: null,
    confidence: "high",
    confirmation: null,
    date: "2030-04-13",
    departureLocation: null,
    departureTime: null,
    evidence: "source evidence",
    kind: "train",
    number: null,
    provider: null,
    provenance: ["ocr"],
    routeLabel: "Train",
    sourceFilename: "source.pdf",
    sourceUploadId: "upload-1",
    ...overrides,
  };
}

export default async function run() {
  await test("three source sightings become one canonical booked activity", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "itinerary",
          emptyStage({
            activities: [
              activity({
                description: "Lunch is planned for 1 PM.",
                sourceFilename: "itinerary.pdf",
                startTime: "13:00",
                title: "Lunch at Harbor House",
              }),
            ],
          })
        ),
        stage(
          "reservation OCR",
          emptyStage({
            activities: [
              activity({
                description: "Reservation for two guests.",
                sourceFilename: "reservation.png",
                startTime: "13:00",
                title: "Harbor House",
              }),
            ],
          })
        ),
        stage(
          "prose",
          emptyStage({
            activities: [
              activity({
                sourceFilename: "notes.txt",
                startTime: "13:00",
                title: "Harbor House lunch",
              }),
            ],
          })
        ),
      ],
      tripOverview: {},
    });
    const activities = (result.draft as { activities: unknown[] }).activities;
    const piece = result.pieces.find((candidate) => candidate.kind === "activity");

    assert.equal(activities.length, 1);
    assert.equal(piece?.observationIds.length, 3);
    assert.equal(piece?.payload.startTime, "13:00");
    assert.match(String(piece?.payload.description), /Reservation for two guests/);
  });

  await test("distinct same-site stops remain separate pieces for assembly grouping", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "same-site day",
          emptyStage({
            activities: [
              activity({
                sourceFilename: "plan.pdf",
                title: "River Palace",
              }),
              activity({
                sourceFilename: "plan.pdf",
                title: "River Palace Gardens",
              }),
            ],
          })
        ),
      ],
      tripOverview: {},
    });

    assert.equal(
      result.pieces.filter(
        (piece) => piece.kind === "activity" && piece.outputEligible
      ).length,
      2
    );
  });

  await test("repeated visits to the same city remain separate dated place pieces", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "trip spine",
          emptyStage({
            places: [
              {
                arriveDate: "2030-04-12",
                city: "Rome",
                country: "Italy",
                leaveDate: "2030-04-14",
              },
              {
                arriveDate: "2030-04-20",
                city: "Rome",
                country: "Italy",
                leaveDate: "2030-04-21",
              },
            ],
          })
        ),
        stage(
          "supporting chunks",
          emptyStage({
            places: [
              {
                arriveDate: "2030-04-12",
                city: "Rome",
                country: "Italy",
                leaveDate: "2030-04-14",
              },
              {
                arriveDate: "2030-04-20",
                city: "Rome",
                country: "Italy",
                leaveDate: "2030-04-21",
              },
            ],
          })
        ),
      ],
      tripOverview: {},
    });
    const places = (result.draft as { places: Array<Record<string, unknown>> })
      .places;

    assert.equal(places.length, 2);
    assert.deepEqual(
      places.map((place) => place.arriveDate),
      ["2030-04-12", "2030-04-20"]
    );
  });

  await test("source overview containers do not become traveler activities", () => {
    const childOne = activity({
      sourceFilename: "plan.pdf",
      title: "Market Hall",
    });
    const childTwo = activity({
      sourceFilename: "plan.pdf",
      title: "Old Library",
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "day plan",
          emptyStage({
            activities: [
              activity({
                description: "Visit Market Hall, then Old Library.",
                sourceFilename: "plan.pdf",
                title: "Sample City day",
              }),
              childOne,
              childTwo,
            ],
          })
        ),
      ],
      tripOverview: {},
    });

    assert.equal((result.draft as { activities: unknown[] }).activities.length, 2);
    assert.equal(result.summary.contextObservationCount, 1);
  });

  await test("connecting segments sharing a confirmation stay separate", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "return flights",
          emptyStage({
            transport: [
              {
                arrival: "HUB",
                arrivalTime: "18:00",
                confirmation: "SAME123",
                date: "2030-04-20",
                departure: "AAA",
                departureTime: "14:00",
                description: null,
                provider: "Example Air 100",
                sourceFilename: "ticket.pdf",
                title: "AAA to HUB",
                type: "flight",
              },
              {
                arrival: "BBB",
                arrivalTime: "21:00",
                confirmation: "SAME123",
                date: "2030-04-20",
                departure: "HUB",
                departureTime: "19:30",
                description: null,
                provider: "Example Air 200",
                sourceFilename: "ticket.pdf",
                title: "HUB to BBB",
                type: "flight",
              },
            ],
          })
        ),
      ],
      tripOverview: {},
    });

    assert.equal((result.draft as { transport: unknown[] }).transport.length, 2);
  });

  await test("written and ISO transport dates cluster before assembly", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [
        anchor({
          anchorId: "vienna-train-anchor",
          arrivalLocation: "Vienna",
          arrivalTime: "13:23",
          confirmation: "1beb5005",
          date: "2019-01-18",
          departureLocation: "Train",
          departureTime: "09:20",
          number: "RJ 1033",
          routeLabel: "Train to Vienna",
        }),
      ],
      stages: [
        stage(
          "written-date-train",
          emptyStage({
            transport: [
              {
                arrival: "Wien Hauptbahnhof",
                arrivalTime: "13:23",
                confirmation: "1beb5005",
                date: "January 18th",
                departure: "Praha Hlavni Nadrazi",
                departureTime: "9:20 AM",
                provider: "RegioJet",
                title: "Prague to Vienna train",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: {
        dateRange: "January 12-25, 2019",
        title: "Central Europe",
      },
    });
    const transports = (result.draft as {
      transport: Array<Record<string, unknown>>;
    }).transport;

    assert.equal(transports.length, 1);
    assert.equal(transports[0]?.date, "2019-01-18");
    assert.equal(transports[0]?.departure, "Praha Hlavni Nadrazi");
    assert.equal(transports[0]?.departureTime, "09:20");
    assert.equal(result.pieces.find((piece) => piece.kind === "transport")?.observationIds.length, 2);
  });

  await test("source anchors enrich a matching piece but weak anchors cannot manufacture rows", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [
        anchor({
          anchorId: "train-anchor",
          arrivalLocation: "Central Station",
          arrivalTime: "13:20",
          departureLocation: "Main Station",
          departureTime: "09:15",
          routeLabel: "Main Station to Central Station",
        }),
        anchor({
          anchorId: "budget-anchor",
          kind: "flight",
          provider: "Budget estimate",
          routeLabel: "Flight to Sample City",
        }),
      ],
      stages: [
        stage(
          "transport",
          emptyStage({
            transport: [
              {
                arrival: "Central Station",
                arrivalTime: null,
                confirmation: null,
                date: "2030-04-13",
                departure: "Main Station",
                departureTime: null,
                description: null,
                provider: null,
                sourceFilename: "itinerary.pdf",
                title: "Train to Central Station",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: {},
    });
    const transport = (result.draft as { transport: Array<Record<string, unknown>> })
      .transport;

    assert.equal(transport.length, 1);
    assert.equal(transport[0]?.departureTime, "09:15");
    assert.equal(transport[0]?.arrivalTime, "13:20");
    assert.equal(result.summary.suppressedWeakAnchorCount, 1);
  });

  await test("corrupt source fragments cannot become standalone transport rows", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [
        anchor({
          anchorId: "corrupt-budget-fragment",
          arrivalLocation: "Rome",
          arrivalTime: "21:50",
          confirmation: null,
          date: "2030-04-20",
          departureLocation: "-> 9:50 PM",
          departureTime: "20:30",
          evidence: "Costs Travel budget. Flight to Rome: $300.",
          kind: "flight",
          routeLabel: "Flight Flight to Rome",
        }),
        anchor({
          anchorId: "corrupt-lockbox-fragment",
          arrivalLocation: null,
          confirmation: "2580",
          date: "2030-04-20",
          departureLocation: null,
          departureTime: "15:00",
          evidence: "Lockbox code 2580. The key will be prepared at 3 PM.",
          routeLabel: "Train",
        }),
      ],
      stages: [stage("empty", emptyStage())],
      tripOverview: {},
    });

    assert.equal((result.draft as { transport: unknown[] }).transport.length, 0);
    assert.equal(result.summary.suppressedWeakAnchorCount, 2);
  });

  await test("canonical facts suppress source-obvious review questions", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "review policy",
          emptyStage({
            activities: [
              activity({
                sourceFilename: "plan.pdf",
                startTime: "19:00",
                title: "Harbor House",
              }),
            ],
            missingDetails: [
              {
                answerType: "date",
                confidence: "medium",
                evidence: "Trip dates are printed in the source.",
                guessedValue: null,
                prompt: "What are the trip dates?",
                reason: "Needed for the app.",
                relatedTitle: null,
                subjectType: "trip",
                targetField: "dateRange",
              },
              {
                answerType: "time",
                confidence: "medium",
                evidence: "Dinner is listed at 7 PM.",
                guessedValue: null,
                prompt: "What time is Harbor House?",
                reason: "Needed for the timeline.",
                relatedTitle: "Harbor House",
                subjectType: "item",
                targetField: "startTime",
              },
              {
                answerType: "confirm",
                confidence: "low",
                evidence: "Ticket purchase is unresolved.",
                guessedValue: null,
                prompt: "Should we buy the optional tower ticket?",
                reason: "The choice changes the traveler plan.",
                relatedTitle: "Harbor House",
                subjectType: "item",
                targetField: "ticketDecision",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "April 12-20, 2030" },
    });
    const missingDetails = (result.draft as { missingDetails: unknown[] })
      .missingDetails as Array<{ prompt?: string }>;

    assert.deepEqual(
      missingDetails.map((detail) => detail.prompt),
      ["Should we buy the optional tower ticket?"]
    );
  });

  await test("production title and time variants become one canonical activity", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "central-europe-lunch",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-16",
                description: "Lunch at U Maliru at 1:00 PM.",
                sourceFilename: "itinerary.pdf",
                startTime: "1:00 PM",
                title: "U Maliru lunch",
              }),
              activity({
                date: "2019-01-16",
                description: "Reservation for one; three-course degustation.",
                sourceFilename: "ticket.pdf",
                startTime: "2019-01-16T13:00:00",
                title: "Lunch at U Malířů",
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const activities = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities;

    assert.equal(activities.length, 1);
    assert.equal(activities[0]?.startTime, "13:00");
    assert.match(String(activities[0]?.description), /degustation/i);
  });

  await test("same-day aliases merge while explicit cross-date visits stay separate", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "budapest-evidence",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-21",
                description: "Gellert Baths.",
                sourceFilename: "plan.pdf",
                title: "Gellert Baths",
              }),
              activity({
                date: "2019-01-21",
                description: "Bath houses, including Gellert Baths.",
                sourceFilename: "plan.pdf",
                title: "Bath houses",
              }),
              activity({
                date: "2019-01-23",
                description:
                  "Gellert Bath House after the spa; return to the lobby for the cafe.",
                sourceFilename: "day-plan.pdf",
                title: "Gellert Bath House",
              }),
              activity({
                date: "2019-01-21",
                sourceFilename: "plan.pdf",
                title: "Pinball Museum",
              }),
              activity({
                date: "2019-01-23",
                sourceFilename: "day-plan.pdf",
                title: "Pinball Museum",
              }),
              activity({
                date: "2019-01-21",
                sourceFilename: "plan.pdf",
                title: "Great Synagogue",
              }),
              activity({
                date: "2019-01-21",
                sourceFilename: "plan.pdf",
                title: "Great Synagogue / Jewish History",
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<{ prompt?: string }>;
    };

    assert.equal(draft.activities.filter((item) => /gellert|bath house/i.test(String(item.title))).length, 2);
    assert.equal(draft.activities.filter((item) => /pinball/i.test(String(item.title))).length, 2);
    assert.equal(draft.activities.filter((item) => /synagogue/i.test(String(item.title))).length, 1);
    assert.equal(
      draft.missingDetails.filter((item) => /Which day should/i.test(item.prompt ?? "")).length,
      0
    );
  });

  await test("separately booked visits to the same venue remain separate pieces", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "repeat-bookings",
          emptyStage({
            activities: [
              {
                ...activity({
                  date: "2019-01-21",
                  sourceFilename: "first-ticket.pdf",
                  startTime: "3:00 PM",
                  title: "Pinball Museum",
                }),
                confirmation: "PIN-ONE",
              },
              {
                ...activity({
                  date: "2019-01-23",
                  sourceFilename: "second-ticket.pdf",
                  startTime: "6:00 PM",
                  title: "Pinball Museum",
                }),
                confirmation: "PIN-TWO",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const activities = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities;

    assert.equal(
      activities.filter((item) => /pinball/i.test(String(item.title))).length,
      2
    );
  });

  await test("tickets and rental returns attach while stray access tasks are rejected", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "attachments",
          emptyStage({
            activities: [
              {
                category: "tours_tickets",
                date: "2019-01-15",
                description: "Klementinum guided tour at 2:30 PM.",
                itemType: "activity",
                startTime: "2:30 PM",
                title: "Klementinum Guided Tour",
              },
              {
                category: "tours_tickets",
                date: "2019-01-15",
                description: "Skip the line ticket.",
                itemType: "activity",
                startTime: "14:30",
                title: "Skip the line ticket",
              },
              {
                address: "Revoluční 1044/23",
                category: "arrival_departure",
                date: "2019-01-17",
                description: "Pick up the rental car at 9 AM.",
                itemType: "activity",
                startTime: "9:00 AM",
                title: "Pick up car for Kutna Hora",
              },
              {
                address: "Revoluční 1044/23, 110 00 Praha 1",
                category: "arrival_departure",
                date: "2019-01-17",
                description: "Return the car at the same location at 20:00.",
                endTime: "20:00",
                itemType: "activity",
                title: "Car return",
              },
              {
                category: "arrival_departure",
                date: "2019-01-24",
                description: "Key pickup from the lockbox.",
                itemType: "activity",
                title: "Collect apartment key",
              },
            ],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                leaveDate: "2019-01-18",
              },
              {
                arriveDate: "2019-01-24",
                city: "Rome",
                leaveDate: "2019-01-25",
              },
            ],
            stays: [
              {
                checkIn: "2019-01-24",
                checkOut: "2019-01-25",
                name: "The RomeHello Hostel",
                stayType: "hostel",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const activities = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities;
    const klementinum = activities.find((item) => /Klementinum/i.test(String(item.title)));
    const rental = activities.find((item) => /Pick up car/i.test(String(item.title)));

    assert.ok(klementinum);
    assert.match(String(klementinum.description), /Skip the line ticket/i);
    assert.equal(activities.some((item) => /Skip the line ticket/i.test(String(item.title))), false);
    assert.ok(rental);
    assert.equal(rental.endTime, "20:00");
    assert.equal(rental.address, "Revoluční 1044/23, 110 00 Praha 1");
    assert.equal(activities.some((item) => /Car return/i.test(String(item.title))), false);
    assert.equal(activities.some((item) => /Collect apartment key/i.test(String(item.title))), false);
  });

  await test("a different rental return location cannot replace the pickup address", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "rental-locations",
          emptyStage({
            activities: [
              {
                address: "Pickup Road 1",
                category: "arrival_departure",
                date: "2019-01-17",
                description: "Pick up the rental car at 9 AM.",
                itemType: "activity",
                startTime: "9:00 AM",
                title: "Pick up car for Kutna Hora",
              },
              {
                address: "Return Road 99",
                category: "arrival_departure",
                date: "2019-01-17",
                description: "Return the car at the airport depot at 8 PM.",
                endTime: "8:00 PM",
                itemType: "activity",
                title: "Car return",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const rental = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities.find((item) => /Pick up car/i.test(String(item.title)));

    assert.ok(rental);
    assert.equal(rental.address, "Pickup Road 1");
    assert.match(String(rental.description), /Return location: Return Road 99/i);
  });

  await test("out-of-range model dates are removed without dropping named evidence", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "trip-range",
          emptyStage({
            places: [
              {
                arriveDate: "2019-01-13",
                city: "Rome",
                leaveDate: "2019-01-25",
              },
            ],
            transport: [
              {
                arrival: "FCO",
                arrivalTime: "10:15",
                date: "2019-05-08",
                departure: "JFK",
                departureTime: "19:46",
                number: "444",
                title: "Flight JFK to FCO",
                type: "flight",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });

    const transport = (result.draft as {
      transport: Array<Record<string, unknown>>;
    }).transport;

    assert.equal(transport.length, 1);
    assert.equal(transport[0]?.date, null);
    assert.equal(transport[0]?._recoveryRequired, true);
    assert.ok(
      result.pieces.some(
        (piece) =>
          piece.kind === "transport" &&
          piece.outputEligible &&
          piece.actions.some(
            (action) =>
              action.type === "recovered" &&
              /outside established trip range/.test(action.reason)
          )
      )
    );
  });

  await test("explicit same-site grouping preserves ordered children and independently timed stops", () => {
    const decisionId = "group_test_schonbrunn";
    const result = clusterExtractedEvidence({
      groupingDecisions: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The source block and venue evidence identify one palace-complex visit.",
        decisionId,
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Schönbrunn Palace complex",
        source: "canonical_resolver",
      }],
      sourceTransportAnchors: [],
      stages: [
        stage(
          "vienna-grouping",
          emptyStage({
            activities: [
              {
                category: "art_culture",
                date: "2019-01-19",
                description:
                  "Same-site Schönbrunn visit including Schönbrunn gardens and the Apple Strudel Show.",
                _canonicalGroupingDecisionIds: [decisionId],
                _resolverCandidateId: "stage-1-item-1",
                itemType: "activity",
                title: "Schönbrunn Palace complex",
              },
              {
                category: "art_culture",
                date: "2019-01-19",
                description: "Walk the gardens.",
                _resolverCandidateId: "stage-1-item-2",
                itemType: "activity",
                title: "Schönbrunn gardens",
              },
              {
                category: "tours_tickets",
                date: "2019-01-19",
                description: "Timed show inside the palace.",
                _resolverCandidateId: "stage-1-item-3",
                itemType: "activity",
                title: "Apple Strudel Show",
              },
              {
                category: "art_culture",
                date: "2019-01-19",
                description: "Visit Hundertwasser House.",
                _resolverCandidateId: "stage-1-item-4",
                itemType: "activity",
                title: "Hundertwasser House",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<{ prompt?: string }>;
    };

    const roots = draft.activities.filter(
      (item) => !item._canonicalParentPieceId
    );
    const children = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.deepEqual(
      roots.map((item) => item.title).sort(),
      [
        "Apple Strudel Show",
        "Hundertwasser House",
        "Schönbrunn Palace complex",
      ].sort()
    );
    assert.deepEqual(
      children.map((item) => item.title),
      ["Schönbrunn Palace complex", "Schönbrunn gardens"]
    );
    assert.equal(
      String(roots.find((item) => item.title === "Schönbrunn Palace complex")?.description ?? "")
        .includes("Walk the gardens"),
      false
    );
    assert.equal(
      draft.missingDetails.filter((item) => /one activity card/i.test(item.prompt ?? "")).length,
      1
    );
  });

  await test("model-only grouping language cannot merge or create a Call", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "clean-day-control",
          emptyStage({
            activities: [
              {
                category: "art_culture",
                date: "2031-04-02",
                description: "Vienna day including Albertina and Prater Ferris Wheel.",
                evidenceRole: "grouping_proposal",
                itemType: "activity",
                title: "Vienna sights",
              },
              {
                category: "art_culture",
                date: "2031-04-02",
                itemType: "activity",
                title: "Albertina",
              },
              {
                category: "art_culture",
                date: "2031-04-02",
                itemType: "activity",
                title: "Prater Ferris Wheel",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "April 1-4, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<{ prompt?: string }>;
    };

    assert.deepEqual(
      draft.activities.map((item) => item.title),
      ["Albertina", "Prater Ferris Wheel"]
    );
    assert.equal(
      draft.missingDetails.some((item) => /one activity card/i.test(item.prompt ?? "")),
      false
    );
  });

  await test("a booked same-site parent keeps its booking while owning untimed stops", () => {
    const decisionId = "group_booked_parent";
    const result = clusterExtractedEvidence({
      groupingDecisions: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The booking covers one same-site palace-complex visit.",
        decisionId,
        parentCandidateId: "stage-1-item-1",
        parentTitle: "River Palace visit",
        source: "canonical_resolver",
      }],
      sourceTransportAnchors: [],
      stages: [stage("booked parent", emptyStage({
        activities: [
          {
            ...activity({
              date: "2031-04-02",
              description: "Booked palace-complex visit covering the grounds.",
              sourceFilename: "booking.pdf",
              startTime: "09:30",
              title: "River Palace",
            }),
            confirmation: "PALACE123",
            _resolverCandidateId: "stage-1-item-1",
          },
          {
            ...activity({
              date: "2031-04-02",
              sourceFilename: "itinerary.txt",
              title: "River Palace gardens",
            }),
            _resolverCandidateId: "stage-1-item-2",
          },
          {
            ...activity({
              date: "2031-04-02",
              sourceFilename: "itinerary.txt",
              title: "River Palace gallery",
            }),
            _resolverCandidateId: "stage-1-item-3",
          },
        ],
      }))],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const parent = draft.activities.find((item) => item.title === "River Palace");
    const children = draft.activities.filter((item) => item._canonicalParentPieceId);

    assert.equal(parent?._canonicalParentPieceId, undefined);
    assert.equal(parent?.startTime, "09:30");
    assert.equal(parent?.confirmation, "PALACE123");
    assert.deepEqual(
      children.map((item) => item.title),
      ["River Palace gardens", "River Palace gallery"]
    );
  });

  await test("canonical notes create one collection per city across repeated city legs", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "rome-notes",
          emptyStage({
            activities: [
              {
                category: "food_dining",
                city: "Rome",
                description: "Pizza ideas.",
                itemType: "note",
                title: "Rome food ideas",
              },
              {
                category: "shopping_tailor",
                city: "Rome",
                description: "Watch shop note.",
                itemType: "note",
                title: "Rome shopping ideas",
              },
            ],
            places: [
              {
                arriveDate: "2019-01-13",
                city: "Rome",
                leaveDate: "2019-01-14",
              },
              {
                arriveDate: "2019-01-24",
                city: "Rome",
                leaveDate: "2019-01-25",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const notes = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities;

    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.title, "Rome Notes & Tips");
    assert.equal(notes[0]?.date, null);
    assert.match(String(notes[0]?.description), /Pizza ideas/);
    assert.match(String(notes[0]?.description), /Watch shop note/);
  });

  await test("independently named same-city stays do not collapse on generic lodging words", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "parallel-stays",
          emptyStage({
            places: [
              {
                arriveDate: "2031-04-01",
                city: "Paris",
                country: "France",
                leaveDate: "2031-04-05",
              },
            ],
            stays: [
              {
                address: "1 Rue Alpha",
                checkIn: "2031-04-01",
                checkOut: "2031-04-05",
                name: "Hotel Central",
                nights: 4,
              },
              {
                address: "9 Rue Beta",
                checkIn: "2031-04-01",
                checkOut: "2031-04-05",
                name: "Hotel Plaza",
                nights: 4,
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });

    assert.deepEqual(
      (result.draft as { stays: Array<{ name: string }> }).stays.map(
        (stay) => stay.name
      ),
      ["Hotel Central", "Hotel Plaza"]
    );
  });

  await test("generic timed placeholders resolve to one uniquely matching named activity", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "day outline",
          emptyStage({
            activities: [
              activity({
                date: "2031-04-05",
                description: "Lunch at 1 PM.",
                sourceFilename: "outline.txt",
                startTime: "13:00",
                title: "Lunch",
              }),
            ],
          })
        ),
        stage(
          "reservation",
          emptyStage({
            activities: [
              activity({
                date: "2031-04-05",
                description: "Reservation for one.",
                sourceFilename: "reservation.txt",
                startTime: "13:00",
                title: "U Maliru lunch reservation",
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "April 1-10, 2031" },
    });
    const activities = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities;

    assert.equal(activities.length, 1);
    assert.equal(activities[0]?.title, "U Maliru lunch reservation");
  });

  await test("source hierarchy keeps city-reference venues out of a dated itinerary block", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "vienna hierarchy",
          emptyStage({
            activities: [
              {
                ...activity({
                  date: "2031-04-04",
                  sourceFilename: "vienna.txt",
                  title: "Ferris wheel",
                }),
                evidenceRole: "atomic_candidate",
                sourceHeadingPath: ["Saturday", "Explore Vienna"],
                sourceSectionLabel: "Explore Vienna",
                sourceSectionType: "dated_itinerary",
              },
              {
                ...activity({
                  date: "2031-04-04",
                  sourceFilename: "vienna.txt",
                  title: "Mozarthaus",
                }),
                city: "Vienna",
                evidenceRole: "city_note_candidate",
                sourceHeadingPath: ["Saturday", "Vienna"],
                sourceSectionLabel: "Vienna",
                sourceSectionType: "city_reference",
              },
              {
                ...activity({
                  date: "2031-04-04",
                  sourceFilename: "vienna.txt",
                  title: "Leopold Museum",
                }),
                city: "Vienna",
                evidenceRole: "city_note_candidate",
                sourceHeadingPath: ["Saturday", "Vienna"],
                sourceSectionLabel: "Vienna",
                sourceSectionType: "city_reference",
              },
            ],
            places: [
              {
                arriveDate: "2031-04-03",
                city: "Vienna",
                leaveDate: "2031-04-06",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "April 3-6, 2031" },
    });
    const activities = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities;

    assert.equal(
      activities.filter((item) => item.itemType !== "note").length,
      1
    );
    assert.equal(activities.find((item) => item.itemType === "note")?.title, "Vienna Notes & Tips");
  });

  await test("chunk-local precise time beats a conflicting spine normalization", () => {
    const transport = (departureTime: string) => ({
      arrival: "JFK",
      arrivalTime: "18:45",
      confirmation: "GHFHPG",
      date: "2019-01-25",
      departure: "FCO",
      departureTime,
      description: null,
      number: "DL1043",
      provider: "Delta",
      title: "Flight Rome to JFK",
      type: "flight",
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        {
          label: "trip spine",
          source: "model_spine",
          stage: emptyStage({ transport: [transport("02:45")] }),
        },
        {
          label: "return flight booking",
          source: "model_chunk",
          sourceProvenance: "text_layer",
          stage: emptyStage({ transport: [transport("14:45")] }),
        },
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });

    assert.equal(
      (result.draft as { transport: Array<{ departureTime: string }> })
        .transport[0]?.departureTime,
      "14:45"
    );
  });

  await test("missing named source evidence becomes review-required content", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "missing venue",
          emptyStage({
            missingDetails: [
              {
                answerType: "confirm",
                confidence: "low",
                evidence: "The itinerary lists Hospital in the Rock.",
                guessedValue: null,
                prompt: "Where should Hospital in the Rock appear?",
                reason: "The source lists the venue but its placement is unclear.",
                relatedTitle: "Hospital in the Rock",
                subjectType: "item",
                targetField: "date",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const recovered = (result.draft as {
      activities: Array<Record<string, unknown>>;
    }).activities.find((item) => item.title === "Hospital in the Rock");

    assert.ok(recovered);
    assert.equal(recovered?._recoveryRequired, true);
  });

  await test("canonical evidence preserves private source text for the public projection", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "private access",
          emptyStage({
            activities: [
              activity({
                date: "2031-04-01",
                description: "WiFi password: secretword. Door code: 1234.",
                sourceFilename: "private.txt",
                title: "Arrival note",
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const description = String(
      (result.draft as { activities: Array<{ description: string }> }).activities[0]
        ?.description
    );

    assert.match(description, /secretword|1234/);
  });

  await test("an undated committed activity gets one provisional city date and one date question", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [{
        label: "Rome plans",
        source: "model_chunk",
        sourceText: "Rome\nWe definitely want to visit the Borghese Gallery.",
        stage: emptyStage({
          activities: [{
            category: "art_culture",
            city: "Rome",
            date: null,
            description: "We definitely want to visit this while in Rome.",
            evidenceRole: "atomic_candidate",
            itemType: "activity",
            sourceSectionType: "unknown",
            title: "Borghese Gallery",
          }],
          places: [{
            arriveDate: "2031-04-01",
            city: "Rome",
            leaveDate: "2031-04-05",
          }],
        }),
      }],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const activity = draft.activities.find(
      (item) => item.title === "Borghese Gallery"
    );
    const question = draft.missingDetails.find(
      (item) => item.relatedTitle === "Borghese Gallery"
    );

    assert.equal(activity?.date, "2031-04-02");
    assert.equal(question?.answerType, "date");
    assert.equal(question?.guessedValue, "2031-04-02");
    assert.equal(question?.answerMin, "2031-04-01");
    assert.equal(question?.answerMax, "2031-04-05");
    assert.equal(question?.prompt, "Which day does Borghese Gallery happen?");
  });

  await test("a fixed alternative slot becomes one single-choice question", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [stage("museum choice", emptyStage({
        activities: [activity({
          date: "2031-04-02",
          description: "Choose one museum for the morning slot.",
          sourceFilename: "itinerary.txt",
          title: "Morning: Museum X or Museum Y",
        })],
      }))],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const question = draft.missingDetails.find(
      (item) => item.targetField === "title"
    );

    assert.equal(draft.activities.length, 1);
    assert.equal(question?.answerType, "single_choice");
    assert.deepEqual(question?.answerOptions, [
      { label: "Museum X", value: "Museum X" },
      { label: "Museum Y", value: "Museum Y" },
    ]);
  });

  await test("a timed generic meal stays visible and asks for only the venue", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [stage("lunch slot", emptyStage({
        activities: [activity({
          date: "2031-04-02",
          sourceFilename: "itinerary.txt",
          startTime: "13:00",
          title: "Lunch",
        })],
      }))],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };

    assert.equal(draft.activities.length, 1);
    assert.equal(draft.missingDetails[0]?.targetField, "locationName");
    assert.equal(
      draft.missingDetails[0]?.prompt,
      "Do you have a specific lunch place for 1:00 PM, or should we keep it nearby?"
    );
  });

  await test("isolated generic meals and ambiguous bare terms stay out of the app with lineage", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [stage("loose notes", emptyStage({
        activities: [
          {
            category: "food_dining",
            city: null,
            date: null,
            description: null,
            evidenceRole: "atomic_candidate",
            itemType: "activity",
            sourceSectionType: "unknown",
            title: "Lunch",
          },
          {
            category: "food_dining",
            city: null,
            date: null,
            description: null,
            evidenceRole: "city_note_candidate",
            itemType: "note",
            sourceSectionType: "unknown",
            title: "Borkonya",
          },
        ],
      }))],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      _evidence: { dispositions: Array<Record<string, unknown>> };
      activities: Array<Record<string, unknown>>;
    };

    assert.equal(draft.activities.length, 0);
    assert.equal(draft._evidence.dispositions.length, result.observations.length);
    assert.equal(
      new Set(
        draft._evidence.dispositions.map((item) => item.observationId)
      ).size,
      result.observations.length
    );
    assert.ok(
      draft._evidence.dispositions.some(
        (item) => item.reasonCode === "needs_identity_enrichment"
      )
    );
  });

  await test("explicit cancellations and replacements become concise Calls", () => {
    const cancelled = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [stage("cancellation", emptyStage({
        activities: [
          activity({
            date: "2031-04-02",
            description: "This museum booking was cancelled.",
            sourceFilename: "update.txt",
            title: "Museum booking",
          }),
          activity({
            date: "2031-04-02",
            description: "Walk through the old town.",
            sourceFilename: "itinerary.txt",
            title: "Old Town walk",
          }),
        ],
      }))],
      tripOverview: { dateRange: "April 1-5, 2031" },
    }).draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    assert.deepEqual(
      cancelled.activities.map((item) => item.title),
      ["Old Town walk"]
    );
    assert.equal(cancelled.missingDetails.length, 1);
    assert.equal(cancelled.missingDetails[0]?._canonicalReviewDisposition, "call");
    assert.match(String(cancelled.missingDetails[0]?.prompt), /left out Museum booking/i);

    const updated = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [stage("replacement", emptyStage({
        activities: [activity({
          date: "2031-04-02",
          description: "Updated time: the museum now starts at 3 PM.",
          sourceFilename: "update.txt",
          startTime: "15:00",
          title: "Museum booking",
        })],
      }))],
      tripOverview: { dateRange: "April 1-5, 2031" },
    }).draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    assert.equal(updated.activities.length, 1);
    assert.equal(updated.missingDetails.length, 1);
    assert.match(String(updated.missingDetails[0]?.prompt), /updated source details/i);
  });
}
