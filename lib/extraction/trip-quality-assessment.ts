import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import type { EvidenceArtifactBundle } from "@/lib/extraction/evidence-artifacts";
import {
  createTripExtractionAuditReport,
  type TripExtractionAuditReport,
} from "@/lib/extraction/trip-extraction-audit";

export const TRIP_QUALITY_ASSESSMENT_VERSION = 2;

export function assessTripAuditReport(report: TripExtractionAuditReport) {
  const p0Diagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "p0"
  );
  const p1Diagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "p1"
  );
  const p2Diagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "p2"
  );
  const hardWarnings = report.warnings.filter(
    (warning) => warning.severity === "hard"
  );
  const quietWarnings = report.warnings.filter(
    (warning) => warning.severity === "quiet"
  );
  const openQuestionCount = report.structured.openQuestions;
  const needsReview =
    p0Diagnostics.length > 0 ||
    p1Diagnostics.length > 0 ||
    hardWarnings.length > 0 ||
    openQuestionCount > 0;

  return {
    disposition: needsReview ? "needs_review" as const : "clean" as const,
    hardWarnings,
    openQuestionCount,
    p0Diagnostics,
    p1Diagnostics,
    p2Diagnostics,
    quietWarnings,
    report,
  };
}

function pluralize(count: number, singular: string, plural = singular + "s") {
  return String(count) + " " + (count === 1 ? singular : plural);
}

export function createTripQualityNotices(
  assessment: ReturnType<typeof assessTripAuditReport>
) {
  const notices: string[] = [];
  const materialDiagnostics = [
    assessment.p0Diagnostics.length > 0
      ? pluralize(assessment.p0Diagnostics.length, "P0 issue")
      : null,
    assessment.p1Diagnostics.length > 0
      ? pluralize(assessment.p1Diagnostics.length, "P1 issue")
      : null,
  ].filter((value): value is string => Boolean(value));

  if (materialDiagnostics.length > 0) {
    notices.push(
      "Semantic audit found " + materialDiagnostics.join(" and ") + "."
    );
  }

  if (assessment.hardWarnings.length > 0) {
    notices.push(
      "Structured review found " +
        pluralize(assessment.hardWarnings.length, "hard warning") +
        "."
    );
  }

  if (assessment.openQuestionCount > 0) {
    notices.push(
      "The draft has " +
        pluralize(assessment.openQuestionCount, "open maker question") +
        "."
    );
  }

  if (assessment.p2Diagnostics.length > 0) {
    notices.push(
      "Semantic audit recorded " +
        pluralize(
          assessment.p2Diagnostics.length,
          "P2 advisory",
          "P2 advisories"
        ) +
        "."
    );
  }

  if (assessment.quietWarnings.length > 0) {
    notices.push(
      "Structured review recorded " +
        pluralize(assessment.quietWarnings.length, "quiet warning") +
        "."
    );
  }

  return notices;
}

export function createTripQualityAssessmentSnapshot(
  assessment: ReturnType<typeof assessTripAuditReport>
) {
  return {
    diagnosticCount: assessment.report.diagnostics.length,
    diagnostics: assessment.report.diagnostics,
    disposition: assessment.disposition,
    hardWarningCount: assessment.hardWarnings.length,
    openQuestionCount: assessment.openQuestionCount,
    p0DiagnosticCount: assessment.p0Diagnostics.length,
    p1DiagnosticCount: assessment.p1Diagnostics.length,
    p2DiagnosticCount: assessment.p2Diagnostics.length,
    quietWarningCount: assessment.quietWarnings.length,
    version: TRIP_QUALITY_ASSESSMENT_VERSION,
  };
}

export function assessTripDraftQuality({
  draft,
  evidenceArtifacts,
  records,
  usage,
}: {
  draft: unknown;
  evidenceArtifacts?: EvidenceArtifactBundle | null;
  records: StructuredTripRecords;
  usage?: unknown;
}) {
  const report = createTripExtractionAuditReport({
    draft,
    evidenceArtifacts,
    records,
    usage,
  });
  return assessTripAuditReport(report);
}

export function attachTripQualityAssessment({
  assessment,
  draft,
}: {
  assessment: ReturnType<typeof assessTripDraftQuality>;
  draft: unknown;
}) {
  const record =
    draft && typeof draft === "object" && !Array.isArray(draft)
      ? (draft as Record<string, unknown>)
      : {};

  return {
    ...record,
    _qualityAssessment: createTripQualityAssessmentSnapshot(assessment),
  };
}
