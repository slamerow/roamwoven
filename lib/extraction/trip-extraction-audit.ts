import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import {
  getSourceTransportAnchorsFromDraft,
  getSourceTransportAnchorsFromUsage,
} from "@/lib/extraction/source-transport-anchors";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import { createAuditLineageRows } from "@/lib/extraction/trip-extraction-audit-lineage";
import {
  compareRawAndAssembledTitles,
  createAssemblySummary,
  createDraftAuditSnapshot,
  createExtractionSummary,
} from "@/lib/extraction/trip-extraction-audit-snapshot";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";
import type { TripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit-types";

export { createDraftAuditSnapshot };
export type {
  DraftAuditSnapshot,
  TripExtractionAuditDiagnostic,
  TripExtractionAuditLineageRow,
  TripExtractionAuditReport,
} from "@/lib/extraction/trip-extraction-audit-types";

export function createTripExtractionAuditReport({
  draft,
  records,
  usage,
}: {
  draft: unknown;
  records: StructuredTripRecords;
  usage?: unknown;
}): TripExtractionAuditReport {
  const summary = createGeneratedTripSummaryView(records);
  const activeItems = records.items.filter((item) => item.status !== "ignored");
  const warnings = summary.warnings.map((warning) => ({
    severity: warning.severity,
    subjectId: warning.subjectId,
    subjectType: warning.subjectType,
    title: warning.title,
  }));
  const lineage = createAuditLineageRows({ records, usage });
  const sourceTransportAnchors = [
    ...getSourceTransportAnchorsFromDraft(draft),
    ...getSourceTransportAnchorsFromUsage(usage),
  ].filter(
    (anchor, index, anchors) =>
      anchors.findIndex((candidate) => candidate.anchorId === anchor.anchorId) ===
      index
  );

  return {
    assembly: createAssemblySummary(usage),
    diagnostics: createAuditDiagnostics({
      lineage,
      records,
      sourceTransportAnchors,
      usage,
    }),
    draft: createDraftAuditSnapshot(draft),
    extraction: createExtractionSummary(usage),
    fingerprints: createTripExtractionFingerprints(records),
    lineage,
    sourceComparison: usage ? compareRawAndAssembledTitles(usage) : null,
    sourceAnchors: {
      transport: sourceTransportAnchors,
    },
    structured: {
      activeActivities: activeItems.filter((item) => item.itemType === "activity")
        .length,
      activeNotes: activeItems.filter((item) => item.itemType === "note").length,
      hardWarnings: warnings.filter((warning) => warning.severity === "hard")
        .length,
      openQuestions: records.reviewQuestions.filter(
        (question) => question.status === "open"
      ).length,
      quietWarnings: warnings.filter((warning) => warning.severity === "quiet")
        .length,
      stays: records.stays.filter((stay) => stay.status !== "ignored").length,
      transport: records.transport.filter((item) => item.status !== "ignored")
        .length,
    },
    warnings,
  };
}
