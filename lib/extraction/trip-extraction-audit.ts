import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import { createAuditLineageRows } from "@/lib/extraction/trip-extraction-audit-lineage";
import {
  compareRawAndAssembledTitles,
  createAssemblySummary,
  createDraftAuditSnapshot,
  createExtractionSummary,
} from "@/lib/extraction/trip-extraction-audit-snapshot";
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

  return {
    assembly: createAssemblySummary(usage),
    diagnostics: createAuditDiagnostics({ lineage, records, usage }),
    draft: createDraftAuditSnapshot(draft),
    extraction: createExtractionSummary(usage),
    lineage,
    sourceComparison: usage ? compareRawAndAssembledTitles(usage) : null,
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
