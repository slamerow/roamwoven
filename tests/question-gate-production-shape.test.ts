import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

// Arc F.3 F3 — HONESTY FIX. TEST-ONLY. NO RUNTIME CHANGE.
//
// `gateOffContractQuestions` (evidence-clustering.ts:1746) is a seven-rule
// question gate. Verified in source at 588ad33: it filters to records where
// `_canonicalReviewDisposition === "question"` (:1750-1755), but that field is
// FIRST assigned inside `canonicalizeCanonicalReviewDetails` (:10420-10433),
// which is called at :11043 — ONE LINE AFTER the gate at :11042. Parser
// `missingDetails` arrive with no disposition at all (the parser's JSON schema
// is additionalProperties:false and declares no such property), so the gate's
// filter yields an EMPTY list for them and none of its rules ever run in
// production.
//
// It has been green this whole time only because the existing fixtures
// hand-seed `_canonicalReviewDisposition: "question"` (and
// `resolverDecisionId`) onto stage-level details —
// tests/assembly-ground-truth-run7.test.ts:729+ — a shape production cannot
// emit. That is precisely what AGENTS.md §Coverage honesty forbids: an
// idealized fixture describing a live pipeline contract as enforced.
//
// This file makes the gap VISIBLE and LOCKED. It asserts the CURRENT, TRUE
// production behavior — the gate does nothing on a parser-shaped detail — so
// the suite stays green and honest at once, and the day someone fixes the
// wiring these assertions fail LOUDLY and on purpose, which is the intended
// tripwire. Rewiring the gate is an Arc G behaviour change (it would start
// dismissing real questions) and must not ride F.3; the ledger records this
// as a KNOWN_GAP under RW-QUE-001.
//
// The positive control at the end is what makes this honest rather than
// fatalistic: F.3's identity rule lives at the boundary that ACTUALLY runs
// (`canonicalizeCanonicalReviewDetails`), so it fires on the same production
// shape where all seven gate rules are silent. That contrast IS the finding.

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

function draftDetails(missingDetails: Detail[]) {
  const result = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      stage(
        "questions",
        emptyStage({ activities: datedRomeDay(), missingDetails })
      ),
    ],
    tripOverview: TRIP_OVERVIEW,
  });
  return (result.draft as { missingDetails: Detail[] }).missingDetails;
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
  test("KNOWN_GAP: the mode/type rule never runs on a parser-shaped missingDetail", () => {
    // The cleanest demonstration. A live parse cannot emit
    // `_canonicalReviewDisposition`, so the gate's filter (:1750-1755) yields
    // nothing, the type rule never executes, and the question ships OPEN to
    // the maker — asking what the source already names.
    const details = draftDetails([PRODUCTION_TYPE_QUESTION]);
    const { detail, disposition, gate } = gateReasonFor(
      details,
      /travel mode for the 9:00 AM/i
    );
    assert.ok(detail, "the question reaches the draft");
    assert.equal(
      disposition,
      "question",
      "KNOWN_GAP (Arc G): gateOffContractQuestions runs at :11042 and filters " +
        "on a field canonicalizeCanonicalReviewDetails assigns at :11043, so " +
        "no rule fires on parser output. If this assertion FAILS the wiring " +
        "was fixed — that is the intended tripwire. Update RW-QUE-001's " +
        "coverage state and delete this check."
    );
    assert.equal(
      /mode\/type curiosity/i.test(gate),
      false,
      "no gate reason is recorded, because no gate rule executed"
    );
  });

  test("A/B: the SAME question is gated when a fixture hand-seeds the disposition", () => {
    // The whole finding in one pair. Identical prompt, identical trip,
    // identical everything except two properties production cannot emit — and
    // the outcome flips. Any fixture that seeds `_canonicalReviewDisposition`
    // is therefore exercising a shape the pipeline never produces
    // (AGENTS.md §Coverage honesty).
    const seeded = draftDetails([SEEDED_SETTLED_DATE_QUESTION]);
    const seededResult = gateReasonFor(seeded, /Rome sightseeing day/i);
    assert.equal(
      seededResult.disposition,
      "dismissed",
      "the seeded shape IS gated — this is what the run7 fixture actually proves"
    );
    assert.match(
      seededResult.gate,
      /auto-applied guessed date/i,
      "and it records an auditable gate reason"
    );

    // The production twin of the same question does NOT reach the gate. It is
    // nevertheless absent from the draft — and THAT is the sharper finding,
    // recorded here because it corrects the docket's framing:
    const production = draftDetails([PRODUCTION_SETTLED_DATE_QUESTION]);
    assert.equal(
      production.some((detail) => /Rome sightseeing day/i.test(String(detail.prompt))),
      false,
      "the settled-date family IS handled in production — but by the Phase-2 " +
        "reconciliation gate (guessedValue equals final canon), not by the " +
        "question gate"
    );
  });

  test("the two paths reach the same verdict through DIFFERENT terminal states", () => {
    // Dark-factory finding (AGENTS.md §Dark-factory: every path must
    // terminate in a NAMED outcome). One defect family, two mechanisms, two
    // terminal states:
    //   seeded  -> RETAINED as `dismissed` with a quotable reason;
    //   production -> FILTERED OUT of the draft entirely, no record, no
    //                 reason, nothing for an audit to quote.
    // So the run7 fixture's green does not merely over-claim coverage — it
    // also hides that production loses the audit trail for this family. Arc G
    // must converge these on the retained-and-reasoned terminal state, not
    // simply rewire the filter.
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
    assert.equal(
      production.filter((detail) =>
        /Rome sightseeing day/i.test(String(detail.prompt))
      ).length,
      0,
      "production path leaves NO record of the same decision (KNOWN_GAP)"
    );
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
    assert.equal(
      type.disposition,
      "question",
      "while the gate's own rules stay silent on the very same draft — which " +
        "is exactly why F.3 placed the identity rule at the boundary that runs"
    );
  });
}
