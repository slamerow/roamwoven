import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";

// Production-shaped Question-gate regressions. Parser `missingDetails` cannot
// emit internal disposition fields, so every assertion here exercises the
// real parser shape. Off-contract questions must be retained as dismissed with
// a reason; silently filtering them would satisfy the maker surface while
// violating RW-OPS-001's auditable terminal-state requirement.

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

type Detail = Record<string, unknown>;

// A firmly dated Rome day, so a guessed-date question about it is the
// SETTLED/bogus family the gate's first rule targets (run7 PC-8's premise).
function datedRomeDay() {
  return [
    {
      category: "sightseeing",
      city: "Rome",
      date: "2019-01-13",
      description: null,
      itemType: "activity",
      startTime: "14:00",
      title: "Colosseum",
    },
  ];
}

// PRODUCTION SHAPE: exactly what a live parse emits — no
// `_canonicalReviewDisposition`, no `resolverDecisionId`. Contrast with the
// run7 fixtures, which seed both.
const PRODUCTION_SETTLED_DATE_QUESTION: Detail = {
  answerType: "date",
  confidence: "medium",
  evidence: "Sunday, January 13th Explore Rome // Land at 10:15 and tour.",
  guessedValue: "January 13th",
  prompt: "What date should be used for the Rome sightseeing day?",
  reason: "The spine needs one explicit date value.",
  targetField: "date",
};

const PRODUCTION_TYPE_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Thursday, January 17th Kutna Hora: 'Pick up car at 9 am'",
  guessedValue: "rental car pickup",
  prompt: "What is the travel mode for the 9:00 AM pick-up?",
  reason: "The exact transport type is not named.",
  targetField: "type",
};

const PRODUCTION_PRIVACY_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Apartment arrival details are handled privately.",
  guessedValue: null,
  prompt: "What access code should be listed?",
  reason: "The traveler may need entry details.",
  targetField: "sensitiveDetails",
};

const PRODUCTION_CUTOFF_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Turn left onto…",
  guessedValue: null,
  prompt: "What comes after the arrival-direction fragment?",
  reason: "The excerpt is cut off before the instruction finishes.",
  targetField: "title",
};

const PRODUCTION_RECEIPT_TITLE_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Status: Paid Total 42.00",
  guessedValue: null,
  prompt: "What should this receipt fragment be called?",
  reason: "The fragment needs a title.",
  targetField: "title",
};

const PRODUCTION_MATERIAL_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Sunday, January 13th: Colosseum ticket choice is still open.",
  guessedValue: null,
  prompt: "Which Colosseum ticket should be listed?",
  reason: "The source leaves the ticket choice unresolved.",
  relatedTitle: "Colosseum",
  subjectType: "item",
  targetField: "ticketType",
};

// The live 7.25.0 identity ask, in the same production shape.
const PRODUCTION_IDENTITY_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Reserved by: / Created:",
  guessedValue: null,
  prompt: "What are the reserved-by and created values for this booking detail?",
  reason: "The booking detail lists reserved-by and created fields.",
  targetField: "reserved_by_created",
};

// The SEEDED shape the existing fixtures use, for the A/B contrast.
const SEEDED_SETTLED_DATE_QUESTION: Detail = {
  ...PRODUCTION_SETTLED_DATE_QUESTION,
  _canonicalReviewDisposition: "question",
  resolverDecisionId: "q-date",
};

function clusteredDraft(
  missingDetails: Detail[],
  activities: Array<Record<string, unknown>> = datedRomeDay()
) {
  const result = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      stage(
        "questions",
        emptyStage({ activities, missingDetails })
      ),
    ],
    tripOverview: TRIP_OVERVIEW,
  });
  return result.draft as Record<string, unknown> & { missingDetails: Detail[] };
}

function draftDetails(
  missingDetails: Detail[],
  activities: Array<Record<string, unknown>> = datedRomeDay()
) {
  return clusteredDraft(missingDetails, activities).missingDetails;
}

function gateReasonFor(details: Detail[], pattern: RegExp) {
  const detail = details.find((candidate) =>
    pattern.test(String(candidate.prompt ?? ""))
  );
  return {
    detail,
    disposition: String(detail?._canonicalReviewDisposition ?? "missing"),
    gate: String(detail?._canonicalQuestionGate ?? ""),
  };
}

export default async function run() {
  test("the mode/type rule dismisses a parser-shaped missingDetail with a reason", () => {
    const details = draftDetails([PRODUCTION_TYPE_QUESTION]);
    const { detail, disposition, gate } = gateReasonFor(
      details,
      /travel mode for the 9:00 AM/i
    );
    assert.ok(detail, "the question reaches the draft");
    assert.equal(
      disposition,
      "dismissed",
      "source-obvious mode/type curiosity must not reach the maker"
    );
    assert.match(gate, /mode\/type curiosity/i);
  });

  test("the production dismissal reason survives structured projection", () => {
    const draft = clusteredDraft([PRODUCTION_TYPE_QUESTION]);
    const records = createStructuredTripRecordsFromDraft({
      draft,
      fallbackTripName: "Question gate",
      tripId: "trip-question-gate-production",
    });
    const dismissed = records.reviewQuestions.find((question) =>
      /travel mode for the 9:00 AM/i.test(question.prompt)
    );

    assert.equal(dismissed?.status, "dismissed");
    assert.match(dismissed?.dismissalReason ?? "", /mode\/type curiosity/i);
  });

  test("seeded and parser-shaped twins converge on the same dismissal", () => {
    const seeded = draftDetails([SEEDED_SETTLED_DATE_QUESTION]);
    const seededResult = gateReasonFor(seeded, /Rome sightseeing day/i);
    assert.equal(
      seededResult.disposition,
      "dismissed",
      "the compatibility shape remains dismissed"
    );
    assert.match(
      seededResult.gate,
      /auto-applied guessed date/i,
      "and it records an auditable gate reason"
    );

    const production = draftDetails([PRODUCTION_SETTLED_DATE_QUESTION]);
    const productionResult = gateReasonFor(
      production,
      /Rome sightseeing day/i
    );
    assert.equal(productionResult.disposition, "dismissed");
    assert.equal(productionResult.gate, seededResult.gate);
  });

  test("the production settled-date path retains its named terminal state", () => {
    const seeded = draftDetails([SEEDED_SETTLED_DATE_QUESTION]);
    const seededRecord = seeded.find((detail) =>
      /Rome sightseeing day/i.test(String(detail.prompt))
    );
    assert.ok(seededRecord, "seeded path retains an auditable record");
    assert.ok(
      String(seededRecord?._canonicalQuestionGate ?? "").length > 0,
      "with a reason a maker-facing audit can quote"
    );

    const production = draftDetails([PRODUCTION_SETTLED_DATE_QUESTION]);
    const productionRecord = production.find((detail) =>
      /Rome sightseeing day/i.test(String(detail.prompt))
    );
    assert.ok(productionRecord, "production retains the dismissed record");
    assert.equal(productionRecord?._canonicalReviewDisposition, "dismissed");
    assert.match(
      String(productionRecord?._canonicalQuestionGate ?? ""),
      /auto-applied guessed date/i
    );
  });

  test("automatic privacy, truncated OCR, and receipt-title rules run on parser-shaped details", () => {
    const cases: Array<[Detail, RegExp, RegExp]> = [
      [PRODUCTION_PRIVACY_QUESTION, /access code should be listed/i, /automatic and final/i],
      [PRODUCTION_CUTOFF_QUESTION, /arrival-direction fragment/i, /OCR fragment/i],
      [PRODUCTION_RECEIPT_TITLE_QUESTION, /receipt fragment be called/i, /receipt\/payment fragments/i],
    ];

    for (const [question, promptPattern, reasonPattern] of cases) {
      const result = gateReasonFor(draftDetails([question]), promptPattern);
      assert.ok(result.detail, `expected retained dismissal for ${question.prompt}`);
      assert.equal(result.disposition, "dismissed");
      assert.match(result.gate, reasonPattern);
    }
  });

  test("a genuinely unresolved material question remains open", () => {
    const result = gateReasonFor(
      draftDetails([PRODUCTION_MATERIAL_QUESTION]),
      /Which Colosseum ticket/i
    );

    assert.ok(result.detail);
    assert.equal(result.disposition, "question");
    assert.equal(result.gate, "");
  });

  test("same-section sub-component questions fold into one container decision on the production shape", () => {
    const heading = "Wednesday, January 16th Lesser Town & Prague Castle";
    const castleQuestion: Detail = {
      answerType: "text",
      confidence: "medium",
      evidence: `${heading}: Need to decide which castle ticket to get.`,
      guessedValue: null,
      prompt: "Which Prague Castle ticket should be listed?",
      reason: "The source leaves the castle ticket unresolved.",
      relatedTitle: "Prague Castle",
      subjectType: "item",
      targetField: "ticketType",
    };
    const vitusQuestion: Detail = {
      ...castleQuestion,
      evidence: `${heading}: St. Vitus tour or visit remains open.`,
      prompt: "Should St. Vitus be a tour or a visit?",
      relatedTitle: "St. Vitus Cathedral",
    };
    const details = draftDetails(
      [castleQuestion, vitusQuestion],
      [
        {
          category: "sightseeing",
          city: "Prague",
          date: "2019-01-16",
          itemType: "activity",
          title: "Prague Castle",
        },
        {
          category: "sightseeing",
          city: "Prague",
          date: "2019-01-16",
          itemType: "activity",
          title: "St. Vitus Cathedral",
        },
      ]
    );
    const castle = gateReasonFor(details, /Which Prague Castle ticket/i);
    const vitus = gateReasonFor(details, /St\. Vitus/i);

    assert.equal(castle.disposition, "question");
    assert.equal(vitus.disposition, "dismissed");
    assert.match(vitus.gate, /one venue complex, one open decision/i);
  });

  test("POSITIVE CONTROL: F.3's identity rule DOES fire on the production shape", () => {
    // F1 was placed at `canonicalizeCanonicalReviewDetails` — the boundary
    // every build and every rebuild actually passes through — precisely
    // because the gate above is unreachable. Same production shape, opposite
    // outcome: this is why F.3 did not "just add a rule to the gate".
    const details = draftDetails([
      PRODUCTION_IDENTITY_QUESTION,
      PRODUCTION_TYPE_QUESTION,
    ]);
    const identity = gateReasonFor(details, /reserved-by and created/i);
    assert.equal(
      identity.disposition,
      "dismissed",
      "the identity ask is dismissed on the production shape"
    );
    assert.match(identity.gate, /identity data/i);
    assert.ok(
      identity.detail,
      "and it is RETAINED with its reason — the terminal state Arc G should " +
        "converge the other families on"
    );

    const type = gateReasonFor(details, /travel mode for the 9:00 AM/i);
    assert.equal(type.disposition, "dismissed");
    assert.match(type.gate, /mode\/type curiosity/i);
  });
}
