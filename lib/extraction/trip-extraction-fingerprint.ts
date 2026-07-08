import { createHash } from "crypto";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { normalizeText } from "@/lib/extraction/traveler-text";

export type TripExtractionFingerprints = {
  activeActivities: string[];
  activeNotes: string[];
  calls: string[];
  counts: {
    activeActivities: number;
    activeNotes: number;
    calls: number;
    openQuestions: number;
    stays: number;
    transport: number;
  };
  hash: string;
  openQuestions: string[];
  sectionHashes: {
    activeActivities: string;
    activeNotes: string;
    calls: string;
    openQuestions: string;
    stays: string;
    transport: string;
  };
  stays: string[];
  transport: string[];
  version: 1;
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function hashValue(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function createTripExtractionFingerprints(
  records: StructuredTripRecords
): TripExtractionFingerprints {
  const activeActivities = sortKeys(
    records.items
      .filter((item) => item.status !== "ignored" && item.itemType === "activity")
      .map((item) =>
        joinKey([
          item.date,
          item.title,
          item.startTime,
          item.endTime,
          item.categoryId,
          item.locationName,
          item.status,
        ])
      )
  );
  const activeNotes = sortKeys(
    records.items
      .filter((item) => item.status !== "ignored" && item.itemType === "note")
      .map((item) =>
        joinKey([
          item.date,
          item.title,
          item.categoryId,
          item.locationName,
          item.description,
          item.status,
        ])
      )
  );
  const calls = sortKeys(
    records.reviewQuestions
      .filter((question) => question.status === "noted")
      .map((question) =>
        joinKey([
          question.subjectType,
          question.targetField,
          question.guessedValue,
          question.reason,
          question.prompt,
        ])
      )
  );
  const openQuestions = sortKeys(
    records.reviewQuestions
      .filter((question) => question.status === "open")
      .map((question) =>
        joinKey([
          question.subjectType,
          question.targetField,
          question.answerType,
          question.prompt,
          question.reason,
        ])
      )
  );
  const stays = sortKeys(
    records.stays
      .filter((stay) => stay.status !== "ignored")
      .map((stay) =>
        joinKey([
          stay.name,
          stay.checkInDate,
          stay.checkOutDate,
          stay.checkInTime,
          stay.addressVisibility,
          stay.publicLocationLabel,
          stay.status,
        ])
      )
  );
  const transport = sortKeys(
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
          item.status,
        ])
      )
  );
  const sections = {
    activeActivities,
    activeNotes,
    calls,
    openQuestions,
    stays,
    transport,
  };

  return {
    ...sections,
    counts: {
      activeActivities: activeActivities.length,
      activeNotes: activeNotes.length,
      calls: calls.length,
      openQuestions: openQuestions.length,
      stays: stays.length,
      transport: transport.length,
    },
    hash: hashValue(sections),
    sectionHashes: {
      activeActivities: hashValue(activeActivities),
      activeNotes: hashValue(activeNotes),
      calls: hashValue(calls),
      openQuestions: hashValue(openQuestions),
      stays: hashValue(stays),
      transport: hashValue(transport),
    },
    version: 1,
  };
}
