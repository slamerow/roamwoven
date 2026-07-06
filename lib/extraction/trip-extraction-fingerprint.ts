import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { normalizeText } from "@/lib/extraction/traveler-text";

export type TripExtractionFingerprints = {
  activeActivities: string[];
  calls: string[];
  openQuestions: string[];
  stays: string[];
  transport: string[];
};

function clean(value: string | null | undefined) {
  return normalizeText(value);
}

function joinKey(parts: Array<string | null | undefined>) {
  return parts.map(clean).join("|");
}

function sortKeys(values: string[]) {
  return values.filter(Boolean).sort();
}

export function createTripExtractionFingerprints(
  records: StructuredTripRecords
): TripExtractionFingerprints {
  return {
    activeActivities: sortKeys(
      records.items
        .filter((item) => item.status !== "ignored" && item.itemType === "activity")
        .map((item) =>
          joinKey([
            item.date,
            item.title,
            item.startTime,
            item.endTime,
            item.categoryId,
            item.parentItemId,
          ])
        )
    ),
    calls: sortKeys(
      records.reviewQuestions
        .filter((question) => question.status === "noted")
        .map((question) =>
          joinKey([
            question.subjectType,
            question.subjectId,
            question.targetField,
            question.guessedValue,
            question.reason,
          ])
        )
    ),
    openQuestions: sortKeys(
      records.reviewQuestions
        .filter((question) => question.status === "open")
        .map((question) =>
          joinKey([
            question.subjectType,
            question.subjectId,
            question.targetField,
            question.answerType,
            question.prompt,
          ])
        )
    ),
    stays: sortKeys(
      records.stays
        .filter((stay) => stay.status !== "ignored")
        .map((stay) =>
          joinKey([
            stay.name,
            stay.checkInDate,
            stay.checkOutDate,
            stay.checkInTime,
            stay.addressVisibility,
          ])
        )
    ),
    transport: sortKeys(
      records.transport
        .filter((item) => item.status !== "ignored")
        .map((item) =>
          joinKey([
            item.transportType,
            item.date,
            item.routeLabel,
            item.departureTime,
            item.arrivalTime,
            item.departureLocation,
            item.arrivalLocation,
            item.provider,
            item.confirmationLabel,
          ])
        )
    ),
  };
}
