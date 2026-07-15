import assert from "node:assert/strict";
import type { CanonicalEvidencePiece } from "@/lib/extraction/evidence-clustering";
import type { TripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";
import { createTripQualityOutcomes } from "@/lib/extraction/trip-quality-outcomes";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";

function piece(description: string): CanonicalEvidencePiece {
  return {
    actions: [],
    confidence: "high",
    conflicts: [],
    fieldSources: {},
    fieldWinnerRanks: {},
    id: "piece-one",
    kind: "activity",
    mergeReasons: [],
    observationIds: ["observation-one"],
    outputEligible: true,
    payload: {
      date: "2032-06-17",
      description,
      itemType: "activity",
      title: "Museum of Example",
    },
    role: "atomic_candidate",
  };
}

const records = createStructuredTripRecordsFromDraft({
  draft: {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: { title: "Example" },
  },
  fallbackTripName: "Example",
  tripId: "quality-outcomes-test",
});

function report(
  overrides: Partial<TripExtractionAuditReport> = {}
): TripExtractionAuditReport {
  return {
    canonicalization: {
      canonicalPieceCount: 0,
      clusteredObservationCount: 0,
      contextObservationCount: 0,
      dispositionCount: 0,
      identityRepairCount: 0,
      identityRecoveryStatus: "not_needed",
      observationCount: 0,
      rejectedObservationCount: 0,
      sourceAnchorObservationCount: 0,
      suppressedStandaloneAnchorCount: 0,
      undisposedObservationCount: 0,
    },
    detectorIncidents: [],
    diagnostics: [],
    draft: {
      activities: [],
      counts: {
        activities: 0,
        missingDetails: 0,
        places: 0,
        sensitiveDetails: 0,
        stays: 0,
        transport: 0,
      },
      missingDetails: [],
      stays: [],
      transport: [],
    },
    extraction: { activityChunks: null, staged: true },
    fingerprints: {
      hash: "fingerprint",
      sections: {},
      version: 1,
    } as unknown as TripExtractionAuditReport["fingerprints"],
    lineage: [],
    sourceAnchors: { transport: [] },
    structured: {
      activeActivities: 0,
      activeNotes: 0,
      groupedStops: 0,
      hardWarnings: 0,
      openQuestions: 0,
      quietWarnings: 0,
      stays: 0,
      transport: 0,
    },
    warnings: [],
    ...overrides,
  };
}

const duplicateDiagnostic = {
  code: "duplicate_same_venue_activity" as const,
  detail: "Duplicate activity.",
  evidence: ["Museum of Example"],
  severity: "p1" as const,
  title: "Arbitrary human-readable copy",
};

export default function run() {
  const detectorReport = report({
    detectorIncidents: [{
      canonicalPieceId: "piece-one",
      code: "canonical_identity_semantic_fallback",
      detail: "Identity drift only.",
      finalRecordId: "record-one",
    }],
  });
  const detectorOutcomes = createTripQualityOutcomes({
    finalPieces: [piece("Booked visit.")],
    finalReport: detectorReport,
    initialPieces: [piece("Booked visit.")],
    initialReport: detectorReport,
    records,
  });
  assert.equal(
    detectorOutcomes[0]?.action,
    "reconciled_detector_identity_without_mutating_output"
  );

  const repairedOutcomes = createTripQualityOutcomes({
    finalPieces: [piece("Canonical invariant applied.")],
    finalReport: report(),
    initialPieces: [piece("Before retry.")],
    initialReport: report({ diagnostics: [duplicateDiagnostic] }),
    records,
  });
  assert.equal(
    repairedOutcomes[0]?.action,
    "canonical_invariant_repair_verified"
  );

  const unresolvedOutcomes = createTripQualityOutcomes({
    finalPieces: [piece("Unchanged.")],
    finalReport: report({ diagnostics: [duplicateDiagnostic] }),
    initialPieces: [piece("Unchanged.")],
    initialReport: report({ diagnostics: [duplicateDiagnostic] }),
    records,
  });
  assert.equal(
    unresolvedOutcomes[0]?.action,
    "conservative_fallback_preserved_for_review"
  );
  assert.equal(unresolvedOutcomes[0]?.classification, "confirmed_output_defect");

  const warningOutcomes = createTripQualityOutcomes({
    finalPieces: [piece("Unchanged.")],
    finalReport: report({
      warnings: [{
        code: "activity_transport_collision",
        severity: "hard",
        subjectId: "item-one",
        subjectType: "item",
        title: "This human copy can change without controlling behavior",
      }],
    }),
    initialPieces: [piece("Unchanged.")],
    initialReport: report({
      warnings: [{
        code: "activity_transport_collision",
        severity: "hard",
        subjectId: "item-one",
        subjectType: "item",
        title: "Old wording said duplicates a travel row",
      }],
    }),
    records,
  });
  assert.equal(
    warningOutcomes[0]?.findingKey,
    "warning:activity_transport_collision:item-one"
  );
  assert.equal(
    warningOutcomes[0]?.action,
    "conservative_fallback_preserved_for_review"
  );
}
