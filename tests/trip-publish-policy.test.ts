import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import {
  assessTripPublishability,
  assessTripPublishReadinessCopy,
} from "@/lib/trip-publish-policy";

export default function run() {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2030-05-01",
          city: "Sample City",
          leaveDate: "2030-05-02",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        dateRange: "May 1-2, 2030",
        title: "Sample Trip",
      },
    },
    fallbackTripName: "Sample Trip",
    tripId: "publish-policy-trip",
  });

  records.reviewQuestions.push({
    answerType: "date",
    answerValue: null,
    canonicalId: "question-1",
    createdAt: null,
    evidence: "The source lists May 1 and May 2.",
    guessedValue: "2030-05-01",
    id: "question-1",
    prompt: "Is this on May 1 or May 2?",
    reason: "The source contains two plausible dates.",
    resolvedAt: null,
    sourceConfidence: "medium",
    status: "open",
    subjectCanonicalId: records.trip.id,
    subjectId: records.trip.id,
    subjectType: "trip",
    targetField: "date",
    tripId: records.trip.id,
  });

  const reviewable = assessTripPublishability(records);

  assert.equal(reviewable.canPublish, true);
  if (!reviewable.canPublish) {
    throw new Error("Expected semantic review state to remain publishable.");
  }
  assert.equal(reviewable.semanticDisposition, "needs_review");
  assert.equal(reviewable.reviewCount, 1);

  const warningRecords = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2030-05-01",
          city: "Vienna",
          leaveDate: "2030-05-02",
        },
      ],
      stays: [],
      transport: [
        {
          arrival: "Vienna",
          confirmation: "1beb5005",
          date: "2030-05-01",
          departure: "Prague",
          description:
            "Train to Vienna departs 09:20 from Praha hl.n. Train code: 1beb5005.",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        dateRange: "May 1-2, 2030",
        title: "Train test",
      },
    },
    fallbackTripName: "Train test",
    tripId: "publish-policy-warning-trip",
  });
  const warningTransport = warningRecords.transport[0];
  assert.ok(warningTransport);
  warningTransport.departureTime = null;
  warningTransport.departureLocation = null;
  const warningReviewable = assessTripPublishability(warningRecords);

  assert.equal(warningReviewable.canPublish, true);
  if (!warningReviewable.canPublish) {
    throw new Error("Expected hard warnings to remain publishable.");
  }
  assert.equal(warningReviewable.semanticDisposition, "needs_review");
  assert.ok(warningReviewable.hardWarningCount > 0);

  const missing = assessTripPublishability(null);
  assert.equal(missing.canPublish, false);
  assert.equal(missing.reason, "records_missing");

  // Arc F (CEO decisions 1+7): open identity/privacy P0 findings and hard
  // warnings flip the readiness copy to "Ready with N privacy warnings";
  // quiet warnings and closed (repaired) findings never change it, and
  // publish itself never blocks.
  const outcome = (findingKey: string, overrides: Record<string, unknown> = {}) => ({
    action: "conservative_fallback_preserved_for_review",
    affectedCanonicalIds: [],
    afterFingerprint: "after",
    beforeFingerprint: "before",
    classification: "confirmed_output_defect",
    findingKey,
    ...overrides,
  });
  const warned = assessTripPublishReadinessCopy({
    qualityRemediation: {
      outcomes: [
        outcome("diagnostic:identity_value_in_public_prose"),
        outcome("diagnostic:protected_code_shape_in_public_prose"),
        outcome("warning:stay_collision:stay-1"),
        // Quiet warning: never changes readiness copy (decision 7).
        outcome("warning:activity_bloat:day-3"),
        // Closed finding: repaired-and-verified never counts.
        outcome("diagnostic:identity_value_in_public_prose", {
          action: "canonical_invariant_repair_verified",
        }),
        // Detector incident: not an output defect, never counts.
        outcome("diagnostic:identity_value_in_public_prose", {
          classification: "confirmed_audit_defect",
        }),
      ],
    },
  });
  assert.equal(warned.state, "ready_with_warnings");
  assert.equal(warned.openPrivacyP0Count, 2);
  assert.equal(warned.openHardWarningCount, 1);
  assert.equal(warned.privacyWarningCount, 3);
  assert.equal(warned.headline, "Ready with 3 privacy warnings");

  const clean = assessTripPublishReadinessCopy({
    qualityRemediation: {
      outcomes: [outcome("warning:activity_bloat:day-3")],
    },
  });
  assert.equal(clean.state, "ready");
  assert.equal(clean.headline, "Private app is ready");
  assert.equal(assessTripPublishReadinessCopy(null).state, "ready");
}
