import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  createGeneratedTripSummaryView,
  type GeneratedTripSummaryView,
} from "@/lib/generated-trip-summary";

export type TripPublishAssessment =
  | {
      canPublish: false;
      reason: "records_missing";
      summary: null;
    }
  | {
      canPublish: true;
      hardWarningCount: number;
      reason: null;
      reviewCount: number;
      semanticDisposition: "clean" | "needs_review";
      summary: GeneratedTripSummaryView;
    };

export function assessTripPublishability(
  records: StructuredTripRecords | null
): TripPublishAssessment {
  if (!records) {
    return {
      canPublish: false,
      reason: "records_missing",
      summary: null,
    };
  }

  const summary = createGeneratedTripSummaryView(records);
  const hardWarningCount = summary.warnings.filter(
    (warning) => warning.severity === "hard"
  ).length;
  const reviewCount = summary.counts.review;

  return {
    canPublish: true,
    hardWarningCount,
    reason: null,
    reviewCount,
    semanticDisposition:
      reviewCount > 0 || hardWarningCount > 0 ? "needs_review" : "clean",
    summary,
  };
}
