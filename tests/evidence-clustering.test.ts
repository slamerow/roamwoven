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
}
