import {
  canonicalCategoryId,
  canonicalItemType,
  canonicalTransportDescription,
  canonicalTransportType,
} from "@/lib/extraction/canonical-field-policy";
import { createStructuredTripRecordsFromDraft as compileCanonicalDraft } from "@/lib/extraction/draft-to-structured-trip";
import { EVIDENCE_CLUSTER_VERSION } from "@/lib/extraction/evidence-clustering";

type DraftRecord = Record<string, unknown>;

function asRecord(value: unknown): DraftRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftRecord)
    : {};
}

function stringValue(record: DraftRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fixturePieceId(collection: string, index: number) {
  return `fixture-${collection}-${index + 1}`;
}

function canonicalizeFixtureDraft(value: unknown) {
  const draft = structuredClone(asRecord(value));
  const evidence = asRecord(draft._evidence);
  const collections = ["activities", "places", "stays", "transport"] as const;
  const hasCurrentCanonicalIdentity =
    evidence.version === EVIDENCE_CLUSTER_VERSION &&
    collections.every((collection) =>
      (Array.isArray(draft[collection]) ? draft[collection] : []).every((item) =>
        Boolean(stringValue(asRecord(item), "_canonicalPieceId"))
      )
    );

  if (hasCurrentCanonicalIdentity) return draft;

  const places = (Array.isArray(draft.places) ? draft.places : []).map(
    (value, index) => ({
      ...asRecord(value),
      _canonicalPieceId: fixturePieceId("place", index),
      city: stringValue(asRecord(value), "city") ?? `Stop ${index + 1}`,
    })
  );
  const stays = (Array.isArray(draft.stays) ? draft.stays : []).map(
    (value, index) => {
      const stay = asRecord(value);
      const nightsValue = stay.nights;
      const nights = typeof nightsValue === "number"
        ? nightsValue
        : typeof nightsValue === "string"
          ? Number(nightsValue)
          : null;
      const checkIn = stringValue(stay, "checkIn") ??
        stringValue(stay, "firstNightDate");
      const checkOut = stringValue(stay, "checkOut");

      return {
        ...stay,
        _canonicalPieceId: fixturePieceId("stay", index),
        checkIn:
          checkIn ??
          (checkOut && nights && nights > 0 ? shiftDate(checkOut, -nights) : null),
        checkOut:
          checkOut ??
          (checkIn && nights && nights > 0 ? shiftDate(checkIn, nights) : null),
        name: stringValue(stay, "name") ?? `Stay ${index + 1}`,
      };
    }
  );
  const transport = (Array.isArray(draft.transport) ? draft.transport : []).map(
    (value, index) => {
      const item = asRecord(value);
      return {
        ...item,
        _canonicalPieceId: fixturePieceId("transport", index),
        arrival:
          stringValue(item, "arrival") ??
          stringValue(item, "arrivalLocation") ??
          stringValue(item, "dropOffLocation"),
        arrivalTime:
          stringValue(item, "arrivalTime") ?? stringValue(item, "endTime"),
        confirmation:
          stringValue(item, "confirmation") ??
          stringValue(item, "confirmationLabel"),
        date:
          stringValue(item, "date") ??
          stringValue(item, "departureDate") ??
          stringValue(item, "pickupDate") ??
          stringValue(item, "startDate"),
        departure:
          stringValue(item, "departure") ??
          stringValue(item, "departureLocation") ??
          stringValue(item, "pickupLocation"),
        departureTime:
          stringValue(item, "departureTime") ??
          stringValue(item, "startTime") ??
          stringValue(item, "time"),
        description: canonicalTransportDescription(
          stringValue(item, "description")
        ),
        title: stringValue(item, "title") ?? `Transport ${index + 1}`,
        type: canonicalTransportType(stringValue(item, "type")),
      };
    }
  );
  const activities = (Array.isArray(draft.activities) ? draft.activities : []).map(
    (value, index) => {
      const item = asRecord(value);
      const title = stringValue(item, "title") ?? `Activity ${index + 1}`;
      const description = stringValue(item, "description");
      const itemType = canonicalItemType({
        description,
        title,
        value: stringValue(item, "itemType"),
      });
      return {
        ...item,
        _canonicalPieceId: fixturePieceId("activity", index),
        category: canonicalCategoryId({
          category: stringValue(item, "category"),
          description,
          itemType,
          title,
        }),
        itemType,
        title,
      };
    }
  );
  const subjects = [
    ...activities.map((item) => ({ id: item._canonicalPieceId, title: item.title })),
    ...stays.map((item) => ({ id: item._canonicalPieceId, title: item.name })),
    ...transport.map((item) => ({ id: item._canonicalPieceId, title: item.title })),
    ...places.map((item) => ({ id: item._canonicalPieceId, title: item.city })),
  ];
  const missingDetails = (
    Array.isArray(draft.missingDetails) ? draft.missingDetails : []
  ).map((value) => {
    const detail = asRecord(value);
    const relatedTitle = stringValue(detail, "relatedTitle")?.toLowerCase();
    const subject = relatedTitle
      ? subjects.find((candidate) =>
          String(candidate.title).toLowerCase().includes(relatedTitle)
        )
      : null;

    return {
      ...detail,
      _canonicalReviewDisposition:
        stringValue(detail, "_canonicalReviewDisposition") ?? "question",
      relatedCanonicalPieceId:
        stringValue(detail, "relatedCanonicalPieceId") ?? subject?.id ?? null,
    };
  });

  delete draft._canonicalFinalization;
  return {
    ...draft,
    activities,
    missingDetails,
    places,
    stays,
    transport,
    _evidence: {
      ...evidence,
      canonicalPieceIds: subjects.map((subject) => subject.id),
      observationIds: [],
      version: EVIDENCE_CLUSTER_VERSION,
    },
  };
}

export function createStructuredTripRecordsFromDraft(
  input: Parameters<typeof compileCanonicalDraft>[0]
) {
  return compileCanonicalDraft({
    ...input,
    draft: canonicalizeFixtureDraft(input.draft),
  });
}
