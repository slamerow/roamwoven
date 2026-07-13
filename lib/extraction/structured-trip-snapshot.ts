import type { StructuredTripRecords } from "@/lib/generated-trip-model";

export const STRUCTURED_TRIP_SNAPSHOT_VERSION = 1;
export const STRUCTURED_TRIP_SNAPSHOT_KEY = "_structuredTripSnapshot";

type StructuredTripSnapshotEnvelope = {
  records: StructuredTripRecords;
  version: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isStructuredTripRecords(value: unknown): value is StructuredTripRecords {
  const record = asRecord(value);

  return Boolean(
    asRecord(record.trip).id &&
      Array.isArray(record.categories) &&
      Array.isArray(record.days) &&
      Array.isArray(record.items) &&
      Array.isArray(record.legs) &&
      Array.isArray(record.privateDetails) &&
      Array.isArray(record.reviewQuestions) &&
      Array.isArray(record.stays) &&
      Array.isArray(record.transport)
  );
}

export function attachStructuredTripSnapshot({
  draft,
  records,
}: {
  draft: unknown;
  records: StructuredTripRecords;
}) {
  return {
    ...asRecord(draft),
    [STRUCTURED_TRIP_SNAPSHOT_KEY]: {
      records,
      version: STRUCTURED_TRIP_SNAPSHOT_VERSION,
    } satisfies StructuredTripSnapshotEnvelope,
  };
}

export function readStructuredTripSnapshot(
  draft: unknown
): StructuredTripRecords | null {
  const envelope = asRecord(asRecord(draft)[STRUCTURED_TRIP_SNAPSHOT_KEY]);

  if (
    envelope.version !== STRUCTURED_TRIP_SNAPSHOT_VERSION ||
    !isStructuredTripRecords(envelope.records)
  ) {
    return null;
  }

  return envelope.records;
}
