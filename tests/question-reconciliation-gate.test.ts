import assert from "node:assert/strict";
import {
  canonicalizeCanonicalReviewDetails,
  clusterExtractedEvidence,
} from "@/lib/extraction/evidence-clustering";

// Phase-2 question-gate fixtures from LIVE run 7.18.2
// (docs/assembly-defect-docket-2026-07-18-run5.md PB-2/PB-5,
// docs/code-audit-2026-07-18.md §C): false-conflict date questions whose
// guessed value equals the final canonical state, double castle ticket
// questions across a dated container and an undated placeholder, stale
// calls, and the date-control coercion.

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

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
  transport: Array<Record<string, unknown>>;
};

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

function viennaTrainStage(missingDetails: Array<Record<string, unknown>>) {
  return [
    stage("Friday, January 18th", emptyStage({
      missingDetails,
      places: [
        { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
        { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
      ],
      stays: [
        {
          checkIn: "2019-01-18",
          checkOut: "2019-01-21",
          name: "Wombats City Hostel Vienna",
          sourceFilename: "itinerary.pdf",
        },
      ],
      transport: [
        {
          arrival: "Vienna Hbf",
          arrivalTime: "13:49",
          confirmation: "1beb5005",
          date: "2019-01-18",
          departure: "Prague",
          departureTime: "09:20",
          provider: "RegioJet",
          sourceFilename: "itinerary.pdf",
          title: "Train Prague to Vienna",
          type: "train",
        },
      ],
    })),
  ];
}

export default async function run() {
  await test("a false-conflict transport date question dies when its guess equals the final row (7.18.2 PB-2)", () => {
    const draft = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: viennaTrainStage([
        {
          answerOptions: [],
          answerType: "text",
          confidence: "medium",
          evidence:
            "Original material and travel evidence conflict: the day section says Friday, January 18th, but the train ticket page shows Fri, 18 Jan 2019.",
          guessedValue: "January 18, 2019",
          prompt: "Should the Vienna train / arrival day be dated Friday, January 18th?",
          reason:
            "This resolves the dated stay/transport placement for the Prague to Vienna train.",
          relatedTitle: "Train Prague to Vienna",
          subjectType: "transport",
          targetField: "date",
        },
      ]),
      tripOverview: TRIP_OVERVIEW,
    }).draft as Draft;

    assert.equal(
      draft.missingDetails.filter((detail) =>
        /dated friday/i.test(String(detail.prompt ?? ""))
      ).length,
      0
    );
    assert.equal(draft.transport.length, 1);
    assert.equal(draft.transport[0]?.date, "2019-01-18");
  });

  await test("a date question proposing a DIFFERENT date than canon survives with a date control (negative control)", () => {
    const draft = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: viennaTrainStage([
        {
          answerOptions: [],
          answerType: "text",
          confidence: "medium",
          evidence: "One page says the 18th, the handwritten note says the 19th.",
          guessedValue: "January 19, 2019",
          prompt: "Should the Vienna train be dated January 19th instead?",
          reason: "The two sources genuinely disagree about the train day.",
          relatedTitle: "Train Prague to Vienna",
          subjectType: "transport",
          targetField: "date",
        },
      ]),
      tripOverview: TRIP_OVERVIEW,
    }).draft as Draft;

    const question = draft.missingDetails.find((detail) =>
      /january 19th/i.test(String(detail.prompt ?? ""))
    );

    assert.ok(question, "a genuine date disagreement must reach the maker");
  });

  await test("guess-equals-state kills a stay question at the gate (R2)", () => {
    const draft = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: viennaTrainStage([
        {
          answerOptions: [],
          answerType: "date",
          confidence: "medium",
          evidence: "Check-in shown on the booking page.",
          guessedValue: "January 18, 2019",
          prompt: "Should the Vienna check-in be January 18th?",
          reason: "Confirming the stay start date.",
          relatedTitle: "Wombats City Hostel Vienna",
          subjectType: "stay",
          targetField: "checkIn",
        },
      ]),
      tripOverview: TRIP_OVERVIEW,
    }).draft as Draft;

    assert.equal(
      draft.missingDetails.filter((detail) =>
        /check-in be january/i.test(String(detail.prompt ?? ""))
      ).length,
      0
    );
  });

  await test("two castle ticket questions consolidate to ONE on the dated container even when the second subject is undated (7.18.2 PB-5)", () => {
    const draft = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, January 16th", emptyStage({
          activities: [
            {
              category: "tours_tickets",
              date: "2019-01-16",
              description:
                "Explore the Prague Castle area. Changing of the Guard at 12:00 PM. Need to decide which ticket to get.",
              itemType: "activity",
              sourceFilename: "itinerary.pdf",
              title: "Lesser Town & Prague Castle",
            },
            {
              category: "tours_tickets",
              date: null,
              description: "Prague castle (2 hours). Need to decide which ticket to get.",
              itemType: "activity",
              sourceFilename: "itinerary.pdf",
              title: "Prague Castle",
            },
          ],
          missingDetails: [
            {
              answerOptions: [],
              answerType: "text",
              confidence: "medium",
              evidence: "Need to decide which ticket to get.",
              guessedValue: null,
              prompt:
                "Which ticket or tour option should be listed for Lesser Town & Prague Castle?",
              reason: "The source marks this activity detail as undecided.",
              relatedTitle: "Lesser Town & Prague Castle",
              subjectType: "item",
              targetField: "description",
            },
            {
              answerOptions: [],
              answerType: "text",
              confidence: "medium",
              evidence: "Prague castle (2 hours) • Need to decide which ticket to get.",
              guessedValue: null,
              prompt: "Which ticket or tour option should be listed for Prague Castle?",
              reason: "The source marks this activity detail as undecided.",
              relatedTitle: "Prague Castle",
              subjectType: "item",
              targetField: "description",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    }).draft as Draft;

    const ticketQuestions = draft.missingDetails.filter((detail) =>
      /which ticket or tour option/i.test(String(detail.prompt ?? ""))
    );

    assert.equal(ticketQuestions.length, 1);
    assert.match(
      String(ticketQuestions[0]?.prompt),
      /Lesser Town & Prague Castle|Lesser Town/
    );
  });

  await test("a stale presentation call about a suppressed piece is dropped; live-piece calls survive (R7)", () => {
    const pieces = [
      {
        actions: [],
        confidence: "high" as const,
        conflicts: [],
        fieldSources: {},
        fieldWinnerRanks: {},
        id: "piece-live",
        kind: "activity" as const,
        mergeReasons: [],
        observationIds: ["obs-1"],
        outputEligible: true,
        payload: { date: "2019-01-14", title: "Old Town walk" },
        role: "atomic_candidate" as const,
      },
      {
        actions: [],
        confidence: "high" as const,
        conflicts: [],
        fieldSources: {},
        fieldWinnerRanks: {},
        id: "piece-suppressed",
        kind: "activity" as const,
        mergeReasons: [],
        observationIds: ["obs-2"],
        outputEligible: false,
        payload: { date: "2019-01-14", title: "Ghost group" },
        role: "atomic_candidate" as const,
      },
    ];
    const details = canonicalizeCanonicalReviewDetails(
      [
        {
          _canonicalReviewDisposition: "call",
          guessedValue: "Old Town walk",
          prompt: "We made Old Town walk one activity card with grouped stops.",
          relatedCanonicalPieceId: "piece-live",
          resolverDecisionId: "decision-1",
          subjectType: "item",
          targetField: "presentation",
        },
        {
          _canonicalReviewDisposition: "call",
          guessedValue: "Ghost group",
          prompt: "We made Ghost group one activity card with grouped stops.",
          relatedCanonicalPieceId: "piece-suppressed",
          resolverDecisionId: "decision-2",
          subjectType: "item",
          targetField: "presentation",
        },
      ],
      pieces,
      TRIP_OVERVIEW
    );

    const prompts = details.map((detail) => String((detail as Record<string, unknown>).prompt ?? ""));
    assert.equal(prompts.some((prompt) => /Old Town walk/.test(prompt)), true);
    assert.equal(prompts.some((prompt) => /Ghost group/.test(prompt)), false);
  });
}
