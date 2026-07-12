import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import type { EvidenceArtifactBundle } from "@/lib/extraction/evidence-artifacts";
import { createTripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";

export const TRIP_QUALITY_ASSESSMENT_VERSION = 1;

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
  const p0Diagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "p0"
  );

  return {
    disposition:
      p0Diagnostics.length > 0 ? "needs_review" as const : "clean" as const,
    p0Diagnostics,
    report,
  };
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
    _qualityAssessment: {
      diagnosticCount: assessment.report.diagnostics.length,
      diagnostics: assessment.report.diagnostics,
      disposition: assessment.disposition,
      p0DiagnosticCount: assessment.p0Diagnostics.length,
      version: TRIP_QUALITY_ASSESSMENT_VERSION,
    },
  };
}
