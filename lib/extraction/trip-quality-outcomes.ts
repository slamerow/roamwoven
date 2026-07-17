import { createHash } from "node:crypto";
import type { CanonicalEvidencePiece } from "@/lib/extraction/evidence-clustering";
import type { TripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";
import type { TripExtractionAuditDiagnostic } from "@/lib/extraction/trip-extraction-audit-types";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

export type TripQualityFindingClassification =
  | "confirmed_audit_defect"
  | "confirmed_output_defect"
  | "confirmed_source_processing_failure"
  | "genuine_maker_decision";

export type TripQualityOutcomeAction =
  | "canonical_invariant_repair_verified"
  | "conservative_fallback_preserved_for_review"
  | "existing_precise_maker_question"
  | "reconciled_detector_identity_without_mutating_output";

export type TripQualityOutcome = {
  action: TripQualityOutcomeAction;
  affectedCanonicalIds: string[];
  afterFingerprint: string;
  beforeFingerprint: string;
  classification: TripQualityFindingClassification;
  findingKey: string;
};

function fingerprint(pieces: CanonicalEvidencePiece[]) {
  return createHash("sha256").update(JSON.stringify(pieces)).digest("hex");
}

function diagnosticClassification(
  code: TripExtractionAuditDiagnostic["code"]
): TripQualityFindingClassification {
  switch (code) {
    case "canonical_evidence_disposition_gap":
    case "critical_transport_source_anchor_missing":
    case "critical_transport_source_anchor_missing_details":
    case "critical_transport_source_anchor_missing_soft_details":
    case "ocr_backfill_failed":
    case "transport_row_without_source_anchor":
    case "weak_transport_source_anchor_unmatched":
      return "confirmed_source_processing_failure";
    case "critical_transport_missing_details":
    case "critical_transport_missing_soft_details":
    case "critical_transport_not_travel_row":
    case "day_overview_activity_survived":
    case "duplicate_same_venue_activity":
    case "loose_tip_promoted_to_activity":
    case "planned_activity_buried_in_city_notes":
    case "transport_description_contaminated":
    case "transport_times_disagree_with_source_anchor":
      return "confirmed_output_defect";
  }
}

function canonicalIdsForSubject(
  report: TripExtractionAuditReport,
  subjectId: string
) {
  return report.lineage.flatMap((row) =>
    row.finalRecords.some((record) => record.id === subjectId) &&
    row.canonicalPieceId
      ? [row.canonicalPieceId]
      : []
  );
}

function seriousFindingMap(report: TripExtractionAuditReport) {
  const findings = new Map<
    string,
    {
      affectedCanonicalIds: string[];
      classification: TripQualityFindingClassification;
      subjectId: string | null;
      subjectType: string | null;
    }
  >();

  for (const diagnostic of report.diagnostics) {
    if (diagnostic.severity !== "p0" && diagnostic.severity !== "p1") continue;
    findings.set(`diagnostic:${diagnostic.code}`, {
      affectedCanonicalIds: diagnostic.canonicalPieceIds ?? [],
      classification: diagnosticClassification(diagnostic.code),
      subjectId: null,
      subjectType: null,
    });
  }

  for (const warning of report.warnings) {
    if (warning.severity !== "hard" && warning.code !== "activity_bloat") {
      continue;
    }
    findings.set(`warning:${warning.code}:${warning.subjectId}`, {
      affectedCanonicalIds: canonicalIdsForSubject(report, warning.subjectId),
      classification: "confirmed_output_defect",
      subjectId: warning.subjectId,
      subjectType: warning.subjectType,
    });
  }

  return findings;
}

function hasPreciseOpenQuestion({
  records,
  subjectId,
  subjectType,
}: {
  records: StructuredTripRecords;
  subjectId: string | null;
  subjectType: string | null;
}) {
  if (!subjectId || !subjectType) return false;
  return records.reviewQuestions.some(
    (question) =>
      question.status === "open" &&
      question.subjectId === subjectId &&
      question.subjectType === subjectType
  );
}

export function createTripQualityOutcomes({
  finalPieces,
  finalReport,
  initialPieces,
  initialReport,
  records,
}: {
  finalPieces: CanonicalEvidencePiece[];
  finalReport: TripExtractionAuditReport;
  initialPieces: CanonicalEvidencePiece[];
  initialReport: TripExtractionAuditReport;
  records: StructuredTripRecords;
}): TripQualityOutcome[] {
  const beforeFingerprint = fingerprint(initialPieces);
  const afterFingerprint = fingerprint(finalPieces);
  const initialFindings = seriousFindingMap(initialReport);
  const finalFindings = seriousFindingMap(finalReport);
  const outcomes: TripQualityOutcome[] = finalReport.detectorIncidents.map(
    (incident) => ({
      action: "reconciled_detector_identity_without_mutating_output",
      affectedCanonicalIds: [incident.canonicalPieceId],
      afterFingerprint,
      beforeFingerprint,
      classification: "confirmed_audit_defect",
      findingKey: `detector:${incident.code}:${incident.canonicalPieceId}`,
    })
  );

  for (const [findingKey, finding] of initialFindings) {
    if (!finalFindings.has(findingKey)) {
      outcomes.push({
        action: beforeFingerprint !== afterFingerprint
          ? "canonical_invariant_repair_verified"
          : "conservative_fallback_preserved_for_review",
        affectedCanonicalIds: finding.affectedCanonicalIds,
        afterFingerprint,
        beforeFingerprint,
        classification: finding.classification,
        findingKey,
      });
    }
  }

  for (const [findingKey, finding] of finalFindings) {
    outcomes.push({
      action: hasPreciseOpenQuestion({
        records,
        subjectId: finding.subjectId,
        subjectType: finding.subjectType,
      })
        ? "existing_precise_maker_question"
        : "conservative_fallback_preserved_for_review",
      affectedCanonicalIds: finding.affectedCanonicalIds,
      afterFingerprint,
      beforeFingerprint,
      classification: finding.classification,
      findingKey,
    });
  }

  return outcomes;
}
