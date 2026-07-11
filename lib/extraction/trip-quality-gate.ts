import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { createTripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";

export class TripDraftQualityGateError extends Error {
  details: unknown;

  constructor(details: unknown) {
    super(
      "Roamwoven found unresolved P0 extraction diagnostics after assembly and kept the draft internal for recovery."
    );
    this.name = "TripDraftQualityGateError";
    this.details = details;
  }
}

export function assertTripDraftQuality({
  draft,
  records,
  usage,
}: {
  draft: unknown;
  records: StructuredTripRecords;
  usage?: unknown;
}) {
  const report = createTripExtractionAuditReport({ draft, records, usage });
  const p0Diagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "p0"
  );

  if (p0Diagnostics.length > 0) {
    throw new TripDraftQualityGateError({
      diagnostics: p0Diagnostics,
      fingerprints: report.fingerprints,
    });
  }

  return report;
}
