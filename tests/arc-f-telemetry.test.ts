import assert from "node:assert/strict";
import {
  createCanonicalizationSummary,
  createExtractionSummary,
} from "@/lib/extraction/trip-extraction-audit-snapshot";
import { createReviewQuestions } from "@/lib/extraction/review-question-policy";

// Arc F telemetry (run 7.23.2 chain 8; docket fixture assertion 8).
// Three audit-blocking telemetry gaps, each proven closed here:
// 8.1 the repair corridor's initialViolations were computed but dropped at
//     the event/summary boundary — must-pass item 7 ("which invariant
//     tripped the repair?") was unknowable from the bundle;
// 8.2 excludedPlanningCostLineCount was computed by source-recovery but
//     dropped by the audit-snapshot whitelist — must-pass item 6 was
//     unverifiable by construction;
// 8.3 dismissed questions kept only a count — chain 7's baths-question
//     dismissal had to be inferred instead of quoted.
// Plus the chain-3 capture-miss advisory: a transport row with no
// confirmation-shaped value is the detectable symptom of a disarmed
// deny-list sweep.

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const LIVE_VIOLATION =
  'missingDetails[3] changed canonical subject piece_2a10274a to tripId';

export default function run() {
  test("8.1 canonicalization summary names the repair corridor's initial violations", () => {
    const summary = createCanonicalizationSummary({
      identityRecovery: {
        actions: ["rebuilt_draft_from_canonical_pieces"],
        attempted: true,
        initialViolations: [LIVE_VIOLATION],
        status: "repaired",
      },
    });
    assert.equal(summary.identityRecoveryStatus, "repaired");
    assert.deepEqual(summary.identityRecoveryInitialViolations, [
      LIVE_VIOLATION,
    ]);
  });

  test("8.1 a not_needed run reports no violations", () => {
    const summary = createCanonicalizationSummary({});
    assert.equal(summary.identityRecoveryStatus, "not_needed");
    assert.deepEqual(summary.identityRecoveryInitialViolations, []);
  });

  test("8.2 excludedPlanningCostLineCount survives the audit-snapshot whitelist", () => {
    const summary = createExtractionSummary({
      sourceRecovery: {
        batchedLineCount: 55,
        droppedLineCount: 0,
        excludedPlanningCostLineCount: 11,
        model: "gpt-5.4-mini",
        outcome: "recovered",
        recoveredLineCount: 41,
        residualUncoveredLineCount: 54,
      },
    });
    assert.equal(summary.sourceRecovery?.excludedPlanningCostLineCount, 11);
  });

  test("8.3 a dismissed detail becomes a dismissed question record carrying its reason", () => {
    const questions = createReviewQuestions({
      draft: {
        missingDetails: [
          {
            _canonicalQuestionGate:
              "subject entity no longer exists after assembly; a review item cannot outlive its subject",
            _canonicalReviewDisposition: "dismissed",
            _canonicalReviewId: "review-baths",
            canonicalReviewId: "review-baths",
            evidence: "Day title: Budapest Bathing",
            prompt: "Which bath house is planned?",
            targetField: "subject",
          },
        ],
      },
      items: [],
      legs: [],
      stays: [],
      transport: [],
      tripId: "trip-arc-f",
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0].status, "dismissed");
    assert.match(
      questions[0].dismissalReason ?? "",
      /cannot outlive its subject/
    );
    assert.equal(questions[0].prompt, "Which bath house is planned?");
  });

  test("8.3 an open question carries no dismissal reason", () => {
    const questions = createReviewQuestions({
      draft: {
        missingDetails: [
          {
            _canonicalReviewDisposition: "question",
            _canonicalReviewId: "review-open",
            canonicalReviewId: "review-open",
            prompt: "Which day is the castle visit?",
            targetField: "date",
          },
        ],
      },
      items: [],
      legs: [],
      stays: [],
      transport: [],
      tripId: "trip-arc-f",
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0].status, "open");
    assert.equal(questions[0].dismissalReason, null);
  });
}
