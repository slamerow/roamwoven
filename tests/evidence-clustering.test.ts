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

  await test("parenthetical aliases and repeated venue sightings stay one piece", () => {
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

    assert.equal(draft.activities.filter((item) => /gellert|bath house/i.test(String(item.title))).length, 1);
    assert.equal(draft.activities.filter((item) => /pinball/i.test(String(item.title))).length, 1);
    assert.equal(draft.activities.filter((item) => /synagogue/i.test(String(item.title))).length, 1);
    assert.equal(
      draft.missingDetails.filter((item) => /Which day should/i.test(item.prompt ?? "")).length,
      2
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

  await test("out-of-range model dates are quarantined without extending canonical output", () => {
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

    assert.equal((result.draft as { transport: unknown[] }).transport.length, 0);
    assert.ok(
      result.pieces.some(
        (piece) =>
          piece.kind === "transport" &&
          !piece.outputEligible &&
          piece.mergeReasons.some((reason) => /outside established trip range/.test(reason))
      )
    );
  });

  await test("explicit same-site grouping creates one Call without swallowing unrelated places", () => {
    const result = clusterExtractedEvidence({
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
                itemType: "activity",
                title: "Schönbrunn Palace complex",
              },
              {
                category: "art_culture",
                date: "2019-01-19",
                description: "Walk the gardens.",
                itemType: "activity",
                title: "Schönbrunn gardens",
              },
              {
                category: "tours_tickets",
                date: "2019-01-19",
                description: "Timed show inside the palace.",
                itemType: "activity",
                title: "Apple Strudel Show",
              },
              {
                category: "art_culture",
                date: "2019-01-19",
                description: "Visit Hundertwasser House.",
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

    assert.deepEqual(
      draft.activities.map((item) => item.title),
      ["Schönbrunn Palace complex", "Hundertwasser House"]
    );
    assert.equal(
      draft.missingDetails.filter((item) => /We grouped/i.test(item.prompt ?? "")).length,
      1
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
}
