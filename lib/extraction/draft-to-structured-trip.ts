import type {
  StructuredTripRecords,
  TripCategoryRecord,
  TripItemRecord,
  TripLegRecord,
  TripPrivateDetailRecord,
  TripStayRecord,
  TripSummaryRecord,
  TripTransportRecord,
  TripTransportType,
  TripItemType,
  TripWeatherHookRecord,
} from "@/lib/generated-trip-model";
import {
  finalizeCanonicalTripDraft,
} from "@/lib/extraction/canonical-trip-finalization";
import {
  getCanonicalDraftId,
  getCanonicalReviewId,
} from "@/lib/extraction/canonical-identity";
import {
  type DraftObject,
  getArray,
  getObject,
  getString,
} from "@/lib/extraction/draft-value";
import { createReviewQuestions } from "@/lib/extraction/review-question-policy";
import {
  getStayAddressVisibility,
  shouldCreatePrivateDetailFromDraftSensitiveDetail,
} from "@/lib/trip-privacy-policy";
import {
  getTripCategoryEmoji,
  getTripCategoryLabel,
  TRIP_CATEGORY_IDS,
} from "@/lib/trip-categories";

function canonicalRecordId({
  item,
  kind,
  tripId,
}: {
  item: DraftObject;
  kind: "item" | "leg" | "stay" | "transport";
  tripId: string;
}) {
  const canonicalId = getCanonicalDraftId(item);
  if (!canonicalId) {
    throw new CanonicalProjectionInvariantError([
      `${kind} is missing its canonical identity`,
    ]);
  }
  return `${tripId}-${kind}-${canonicalId}`;
}

function requiredCanonicalId(item: DraftObject, label: string) {
  const canonicalId = getCanonicalDraftId(item);

  if (!canonicalId) {
    throw new CanonicalProjectionInvariantError([
      `${label} is missing its canonical identity`,
    ]);
  }

  return canonicalId;
}

const CANONICAL_TRANSPORT_TYPES = new Set<TripTransportType>([
  "flight",
  "train",
  "ferry",
  "rental_car",
  "transfer",
  "bus",
  "drive",
  "other",
]);
const CANONICAL_ITEM_TYPES = new Set<TripItemType>([
  "activity",
  "note",
  "admin",
  "rest_day",
  "social",
  "placeholder",
]);
const CANONICAL_CATEGORY_IDS = new Set<string>(TRIP_CATEGORY_IDS);

function recordKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "record";
}

function requiredCanonicalString(
  item: DraftObject,
  key: string,
  label: string
) {
  const value = getString(item, key);
  if (!value) {
    throw new CanonicalProjectionInvariantError([`${label} is missing`]);
  }
  return value;
}

function exactCanonicalTransportType(item: DraftObject) {
  const value = getString(item, "type") as TripTransportType | null;
  if (!value || !CANONICAL_TRANSPORT_TYPES.has(value)) {
    throw new CanonicalProjectionInvariantError([
      `transport type ${JSON.stringify(value)} is not canonical`,
    ]);
  }
  return value;
}

function exactCanonicalItemType(item: DraftObject) {
  const value = getString(item, "itemType") as TripItemType | null;
  if (!value || !CANONICAL_ITEM_TYPES.has(value)) {
    throw new CanonicalProjectionInvariantError([
      `item type ${JSON.stringify(value)} is not canonical`,
    ]);
  }
  return value;
}

function exactCanonicalCategoryId(item: DraftObject) {
  const value = getString(item, "category");
  if (!value || !CANONICAL_CATEGORY_IDS.has(value)) {
    throw new CanonicalProjectionInvariantError([
      `category ${JSON.stringify(value)} is not canonical`,
    ]);
  }
  return value;
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function datesBetweenExclusiveEnd(startDate: string | null, endDate: string | null) {
  if (!isIsoDate(startDate)) {
    return [];
  }

  if (!isIsoDate(endDate) || endDate <= startDate) {
    return [startDate];
  }

  const dates: string[] = [];
  for (let date = startDate; date < endDate; date = addDays(date, 1)) {
    dates.push(date);
  }

  return dates;
}

function getFinalLeaveDate(legs: TripLegRecord[]) {
  return legs
    .map((leg) => leg.leaveDate)
    .filter(isIsoDate)
    .sort()
    .at(-1) ?? null;
}

function collectDraftDates(draft: unknown) {
  const dates: string[] = [];
  const addDate = (value: string | null) => {
    if (isIsoDate(value)) {
      dates.push(value);
    }
  };
  const addObjectDates = (collection: string, fields: string[]) => {
    for (const item of getArray(draft, collection)) {
      const object =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as DraftObject)
          : null;

      if (!object) {
        continue;
      }

      for (const field of fields) {
        addDate(getString(object, field));
      }
    }
  };

  addObjectDates("activities", ["date"]);
  addObjectDates("transport", ["date"]);
  addObjectDates("places", ["arriveDate", "leaveDate"]);
  addObjectDates("stays", ["checkIn", "firstNightDate", "checkOut"]);

  return Array.from(new Set(dates)).sort();
}

function createTripRecord({
  draft,
  fallbackTripName,
  tripId,
}: {
  draft: unknown;
  fallbackTripName: string;
  tripId: string;
}): TripSummaryRecord {
  const overview = getObject(draft, "tripOverview");
  const title = getString(overview, "title") ?? fallbackTripName;
  const draftDates = collectDraftDates(draft);

  return {
    destinationSummary: getString(overview, "destinationSummary"),
    endDate: draftDates.at(-1) ?? null,
    id: tripId,
    name: fallbackTripName,
    startDate: draftDates[0] ?? null,
    travelerAppTitle: title,
  };
}

function createLegRecords({
  draft,
  tripId,
}: {
  draft: unknown;
  tripId: string;
}): TripLegRecord[] {
  const places = getArray(draft, "places");

  return places.map((item, index) => {
    const place = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const city = requiredCanonicalString(place, "city", `place[${index}].city`);
    const country = getString(place, "country");
    const key = recordKey([city, country].filter(Boolean).join("-"));
    const arriveDate = getString(place, "arriveDate");
    const leaveDate = getString(place, "leaveDate");

    return {
      arriveDate,
      canonicalId: requiredCanonicalId(place, `place[${index}]`),
      city,
      country,
      displayName: city,
      id: canonicalRecordId({
        item: place,
        kind: "leg",
        tripId,
      }),
      language: null,
      latitude: null,
      leaveDate,
      legKey: key,
      longitude: null,
      region: null,
      reviewRequired: false,
      sortOrder: index,
      sourceConfidence: "medium",
      status: "draft",
      summary: null,
      timezone: null,
      tripId,
    };
  });
}

function findLegForDate(legs: TripLegRecord[], date: string | null) {
  if (!date) {
    return null;
  }

  return (
    legs.find(
      (leg) =>
        leg.arriveDate &&
        leg.leaveDate &&
        date >= leg.arriveDate &&
        date < leg.leaveDate
    ) ?? legs.find((leg) => leg.arriveDate === date) ?? null
  );
}

function findLegForCanonicalCity(
  legs: TripLegRecord[],
  city: string | null
) {
  if (!city) {
    return null;
  }

  const normalizedCity = city.trim().toLocaleLowerCase();

  return (
    legs.find(
      (leg) => leg.city.trim().toLocaleLowerCase() === normalizedCity
    ) ?? null
  );
}

function createStayRecords({
  draft,
  legs,
  tripId,
}: {
  draft: unknown;
  legs: TripLegRecord[];
  tripId: string;
}): TripStayRecord[] {
  return getArray(draft, "stays").map((item, index) => {
    const stay = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const name = requiredCanonicalString(stay, "name", `stay[${index}].name`);
    const checkIn = getString(stay, "checkIn") ?? getString(stay, "firstNightDate");
    const leg = findLegForDate(legs, checkIn);
    const checkOut = getString(stay, "checkOut");
    const address = getString(stay, "address");
    const stayType = getString(stay, "stayType");

    return {
      accessDetailsVisibility: "traveler_password",
      address,
      addressVisibility: getStayAddressVisibility({
        address,
        name,
        publicLocationLabel: leg?.displayName ?? null,
        stayType,
      }),
      bookingUrl: null,
      canonicalId: requiredCanonicalId(stay, `stay[${index}]`),
      checkInDate: checkIn,
      checkInTime: getString(stay, "checkInTime"),
      checkOutDate: checkOut,
      checkOutTime: getString(stay, "checkOutTime"),
      confirmationLabel: getString(stay, "confirmation"),
      confirmationVisibility: "traveler_password",
      id: canonicalRecordId({
        item: stay,
        kind: "stay",
        tripId,
      }),
      latitude: null,
      legId: leg?.id ?? null,
      longitude: null,
      name,
      privateDetailIds: [],
      publicLocationLabel: leg?.displayName ?? null,
      reviewRequired: !checkIn,
      sourceConfidence: "medium",
      status: "draft",
      stayType,
      tripId,
    };
  });
}

function createTransportRecords({
  draft,
  legs,
  tripId,
}: {
  draft: unknown;
  legs: TripLegRecord[];
  tripId: string;
}): TripTransportRecord[] {
  const transportItems = getArray(draft, "transport");

  return transportItems.map((item, index) => {
    const transport = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = requiredCanonicalString(
      transport,
      "title",
      `transport[${index}].title`
    );
    const date = getString(transport, "date");
    const leg = findLegForDate(legs, date);
    const transportType = exactCanonicalTransportType(transport);
    const description = getString(transport, "description");
    const departure = getString(transport, "departure");
    const arrival = getString(transport, "arrival");
    const provider = getString(transport, "provider");
    const confirmation = getString(transport, "confirmation");
    return {
      arrivalLocation: arrival,
      arrivalTime: getString(transport, "arrivalTime"),
      bookingUrl: null,
      bookingUrlVisibility: "traveler_password",
      canonicalId: requiredCanonicalId(transport, `transport[${index}]`),
      confirmationLabel: confirmation,
      confirmationVisibility: confirmation
        ? "traveler_password"
        : "public",
      date,
      departureLocation: departure,
      departureTime: getString(transport, "departureTime"),
      description,
      fromLegId: null,
      id: canonicalRecordId({
        item: transport,
        kind: "transport",
        tripId,
      }),
      legId: leg?.id ?? null,
      privateDetailIds: [],
      provider,
      reviewRequired: !date,
      routeLabel: title,
      sourceConfidence: "medium",
      status: "draft",
      toLegId: null,
      transportType,
      tripId,
    };
  });
}

function createItemRecords({
  draft,
  legs,
  tripId,
}: {
  draft: unknown;
  legs: TripLegRecord[];
  tripId: string;
}): TripItemRecord[] {
  return getArray(draft, "activities").map((item, index) => {
    const activity = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = requiredCanonicalString(
      activity,
      "title",
      `activity[${index}].title`
    );
    const description = getString(activity, "description");
    const date = getString(activity, "date");
    const itemType = exactCanonicalItemType(activity);
    const startTime = getString(activity, "startTime");
    const endTime = getString(activity, "endTime");
    const recoveryRequired = activity._recoveryRequired === true;
    const candidateLeg =
      findLegForDate(legs, date) ??
      findLegForCanonicalCity(legs, getString(activity, "city"));
    const finalDate = date;
    const leg = candidateLeg;
    const categoryId = exactCanonicalCategoryId(activity);
    const parentCanonicalId = getString(activity, "_canonicalParentPieceId");

    return {
      address: getString(activity, "address"),
      canonicalId: requiredCanonicalId(activity, `activity[${index}]`),
      categoryId,
      date: finalDate,
      description,
      endTime,
      id: canonicalRecordId({
        item: activity,
        kind: "item",
        tripId,
      }),
      itemType,
      latitude: null,
      legId: leg?.id ?? null,
      locationName: null,
      longitude: null,
      parentItemId: parentCanonicalId
        ? `${tripId}-item-${parentCanonicalId}`
        : null,
      reviewRequired:
        itemType === "note" ? false : recoveryRequired || !finalDate,
      sortOrder: index,
      sourceConfidence: "medium",
      startTime,
      status:
        (recoveryRequired || !finalDate) && itemType !== "note"
          ? "needs_review"
          : "draft",
      summary: null,
      title,
      tripId,
      url: null,
    };
  });
}

function createCategoryRecords({
  items,
  tripId,
}: {
  items: TripItemRecord[];
  tripId: string;
}): TripCategoryRecord[] {
  const keys = Array.from(new Set(items.map((item) => item.categoryId)));

  return keys.map((key, index) => ({
    categoryKey: key,
    description: getTripCategoryLabel(key),
    emoji: getTripCategoryEmoji(key),
    enabled: true,
    icon: null,
    id: key,
    label: getTripCategoryLabel(key),
    sortOrder: index,
    tripId,
  }));
}

function createPrivateDetailRecords({
  draft,
  stays,
  transport,
  tripId,
}: {
  draft: unknown;
  stays: TripStayRecord[];
  transport: TripTransportRecord[];
  tripId: string;
}): TripPrivateDetailRecord[] {
  const stayDetails = stays
    .filter((stay) => stay.address && stay.addressVisibility !== "public")
    .map((stay) => ({
      detailType: "private_address",
      id: `${stay.id}-address`,
      label: "Exact stay address",
      reason: "Every exact lodging address stays behind traveler mode.",
      reviewRequired: false,
      sourceConfidence: "medium" as const,
      subjectCanonicalId: stay.canonicalId,
      subjectId: stay.id,
      subjectType: "stay" as const,
      tripId,
      value: stay.address ?? "",
      visibility: "traveler_password" as const,
    }));
  const stayConfirmationDetails = stays
    .filter((stay) => stay.confirmationLabel)
    .map((stay) => ({
      detailType: "confirmation_number",
      id: `${stay.id}-confirmation`,
      label: "Stay confirmation",
      reason: "Stay booking-control identifiers stay behind traveler mode.",
      reviewRequired: false,
      sourceConfidence: "medium" as const,
      subjectCanonicalId: stay.canonicalId,
      subjectId: stay.id,
      subjectType: "stay" as const,
      tripId,
      value: stay.confirmationLabel ?? "",
      visibility: "traveler_password" as const,
    }));

  const transportDetails = transport
    .filter((item) => item.confirmationLabel)
    .map((item) => ({
      detailType: "confirmation_number",
      id: `${item.id}-confirmation`,
      label: "Confirmation",
      reason: "Booking references should default behind traveler mode.",
      reviewRequired: false,
      sourceConfidence: "medium" as const,
      subjectCanonicalId: item.canonicalId,
      subjectId: item.id,
      subjectType: "transport" as const,
      tripId,
      value: item.confirmationLabel ?? "",
      visibility: "traveler_password" as const,
    }));

  const sensitive = getArray(draft, "sensitiveDetails").flatMap((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(detail, "title") ?? `Sensitive detail ${index + 1}`;
    const detailType = getString(detail, "detailType") ?? "sensitive_detail";
    const reason = getString(detail, "reason");

    if (
      !shouldCreatePrivateDetailFromDraftSensitiveDetail({
        detailType,
        reason,
        title,
      })
    ) {
      return [];
    }

    return [{
      detailType,
      id: `${tripId}-sensitive-${index + 1}`,
      label: title,
      reason,
      reviewRequired: true,
      sourceConfidence: "medium" as const,
      subjectCanonicalId: tripId,
      subjectId: tripId,
      subjectType: "leg" as const,
      tripId,
      value: title,
      visibility: "traveler_password" as const,
    }];
  });

  return [
    ...stayDetails,
    ...stayConfirmationDetails,
    ...transportDetails,
    ...sensitive,
  ];
}

function createDayRecords({
  items,
  legs,
  transport,
  tripId,
}: {
  items: TripItemRecord[];
  legs: TripLegRecord[];
  transport: TripTransportRecord[];
  tripId: string;
}): StructuredTripRecords["days"] {
  const finalLeaveDate = getFinalLeaveDate(legs);
  const dates = Array.from(
    new Set(
      [
        ...items.map((item) => item.date),
        ...transport.map((item) => item.date),
        finalLeaveDate,
        ...legs.flatMap((leg) =>
          datesBetweenExclusiveEnd(leg.arriveDate, leg.leaveDate)
        ),
      ].filter(Boolean) as string[]
    )
  ).sort();

  return dates.map((date, index) => {
    const legIds = legs
      .filter(
        (leg) =>
          (leg.arriveDate && leg.leaveDate && date >= leg.arriveDate && date < leg.leaveDate) ||
          leg.arriveDate === date ||
          (leg.leaveDate === date && leg.leaveDate === finalLeaveDate)
      )
      .map((leg) => leg.id);
    const dayItems = items.filter((item) => item.date === date);

    return {
      date,
      dayNumber: index + 1,
      id: `${tripId}-day-${date}`,
      legIds,
      primaryLegId: legIds[0] ?? null,
      reviewRequired: dayItems.some((item) => item.reviewRequired),
      sortOrder: index,
      sourceConfidence: "medium",
      status: "draft",
      summary: null,
      title: `Day ${index + 1}`,
      tripId,
    };
  });
}

function createWeatherHooks({
  days,
  legs,
  tripId,
}: {
  days: StructuredTripRecords["days"];
  legs: TripLegRecord[];
  tripId: string;
}): TripWeatherHookRecord[] {
  return days.map((day) => {
    const leg = legs.find((item) => item.id === day.primaryLegId);

    return {
      date: day.date,
      enabled: Boolean(leg),
      id: `${day.id}-weather`,
      latitude: leg?.latitude ?? null,
      legId: day.primaryLegId,
      locationLabel: leg?.displayName ?? "Trip stop",
      longitude: leg?.longitude ?? null,
      source: leg?.latitude && leg.longitude ? "coordinates" : "city_country",
      timezone: leg?.timezone ?? null,
      tripId,
    };
  });
}

export class CanonicalProjectionInvariantError extends Error {
  constructor(violations: string[]) {
    super(`Canonical projection changed semantic data: ${violations.join("; ")}`);
    this.name = "CanonicalProjectionInvariantError";
  }
}

function assertCanonicalProjectionInvariant({
  draft,
  records,
}: {
  draft: unknown;
  records: StructuredTripRecords;
}) {
  const violations: string[] = [];
  const assertCount = (collection: string, actual: number) => {
    const expected = getArray(draft, collection).length;
    if (expected !== actual) {
      violations.push(`${collection} count ${expected} became ${actual}`);
    }
  };
  assertCount("activities", records.items.length);
  assertCount("places", records.legs.length);
  assertCount("stays", records.stays.length);
  assertCount("transport", records.transport.length);
  assertCount("missingDetails", records.reviewQuestions.length);

  const canonicalPairs = <T extends { canonicalId: string }>(
    collection: string,
    recordsForCollection: T[]
  ) => {
    const recordByCanonicalId = new Map<string, T>();
    recordsForCollection.forEach((record, index) => {
      if (recordByCanonicalId.has(record.canonicalId)) {
        violations.push(
          `${collection} record[${index}] duplicates canonical identity ${record.canonicalId}`
        );
      }
      recordByCanonicalId.set(record.canonicalId, record);
    });

    return getArray(draft, collection).flatMap((value, index) => {
      const source =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as DraftObject)
          : {};
      const canonicalId = getCanonicalDraftId(source);
      const record = canonicalId ? recordByCanonicalId.get(canonicalId) : null;

      if (!canonicalId) {
        violations.push(`${collection}[${index}] has no canonical identity`);
        return [];
      }
      if (!record) {
        violations.push(
          `${collection}[${index}] identity ${canonicalId} has no structured record`
        );
        return [];
      }

      return [{ canonicalId, index, record, source }];
    });
  };
  const expect = (
    label: string,
    expected: string | null,
    actual: string | null
  ) => {
    if (expected !== actual) {
      violations.push(`${label} ${JSON.stringify(expected)} became ${JSON.stringify(actual)}`);
    }
  };

  canonicalPairs("places", records.legs).forEach(({ index, record, source }) => {
    expect(`place[${index}].city`, getString(source, "city"), record.city);
    expect(`place[${index}].arriveDate`, getString(source, "arriveDate"), record.arriveDate);
    expect(`place[${index}].leaveDate`, getString(source, "leaveDate"), record.leaveDate);
  });
  canonicalPairs("stays", records.stays).forEach(({ index, record, source }) => {
    expect(`stay[${index}].name`, getString(source, "name"), record.name);
    expect(
      `stay[${index}].checkIn`,
      getString(source, "checkIn") ?? getString(source, "firstNightDate"),
      record.checkInDate
    );
    expect(`stay[${index}].checkOut`, getString(source, "checkOut"), record.checkOutDate);
    expect(`stay[${index}].address`, getString(source, "address"), record.address);
  });
  canonicalPairs("transport", records.transport).forEach(
    ({ index, record, source }) => {
      expect(`transport[${index}].title`, getString(source, "title"), record.routeLabel);
      expect(`transport[${index}].date`, getString(source, "date"), record.date);
      expect(`transport[${index}].type`, getString(source, "type"), record.transportType);
      expect(
        `transport[${index}].description`,
        getString(source, "description"),
        record.description
      );
    }
  );
  canonicalPairs("activities", records.items).forEach(
    ({ index, record, source }) => {
      expect(`activity[${index}].title`, getString(source, "title"), record.title);
      expect(`activity[${index}].date`, getString(source, "date"), record.date);
      expect(`activity[${index}].itemType`, getString(source, "itemType"), record.itemType);
      expect(`activity[${index}].category`, getString(source, "category"), record.categoryId);
      expect(
        `activity[${index}].description`,
        getString(source, "description"),
        record.description
      );
      const parentCanonicalId = getString(source, "_canonicalParentPieceId");
      expect(
        `activity[${index}].parentItemId`,
        parentCanonicalId ? `${records.trip.id}-item-${parentCanonicalId}` : null,
        record.parentItemId
      );
    }
  );

  const itemIds = new Set(records.items.map((item) => item.id));
  records.items.forEach((item) => {
    if (item.parentItemId && !itemIds.has(item.parentItemId)) {
      violations.push(
        `item ${item.id} targets missing parent ${item.parentItemId}`
      );
    }
    if (item.parentItemId === item.id) {
      violations.push(`item ${item.id} cannot parent itself`);
    }
  });

  const reviewByCanonicalId = new Map(
    records.reviewQuestions.map((question) => [question.canonicalId, question])
  );
  getArray(draft, "missingDetails").forEach((value, index) => {
    const detail =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as DraftObject)
        : {};
    const canonicalReviewId = getCanonicalReviewId(detail);
    const question = canonicalReviewId
      ? reviewByCanonicalId.get(canonicalReviewId)
      : null;
    const subjectCanonicalId = getString(detail, "relatedCanonicalPieceId");

    if (!canonicalReviewId || !question) {
      violations.push(
        `missingDetails[${index}] has no matching canonical review record`
      );
      return;
    }
    if (
      subjectCanonicalId &&
      question.subjectCanonicalId &&
      subjectCanonicalId !== question.subjectCanonicalId
    ) {
      violations.push(
        `missingDetails[${index}] changed canonical subject ${subjectCanonicalId} to ${question.subjectCanonicalId}`
      );
    }
  });

  const entityIds = new Set([
    ...records.items.map((record) => record.canonicalId),
    ...records.legs.map((record) => record.canonicalId),
    ...records.stays.map((record) => record.canonicalId),
    ...records.transport.map((record) => record.canonicalId),
    records.trip.id,
  ]);
  records.privateDetails.forEach((detail) => {
    if (!entityIds.has(detail.subjectCanonicalId)) {
      violations.push(
        `private detail ${detail.id} targets missing canonical identity ${detail.subjectCanonicalId}`
      );
    }
  });
  records.reviewQuestions.forEach((question) => {
    if (!entityIds.has(question.subjectCanonicalId)) {
      violations.push(
        `review ${question.id} targets missing canonical identity ${question.subjectCanonicalId}`
      );
    }
  });

  if (violations.length > 0) {
    throw new CanonicalProjectionInvariantError(violations);
  }
}

export function createStructuredTripRecordsFromDraft({
  draft,
  fallbackTripName,
  tripId,
}: {
  draft: unknown;
  fallbackTripName: string;
  tripId: string;
}): StructuredTripRecords {
  const finalizedDraft = finalizeCanonicalTripDraft(draft).draft;
  const trip = createTripRecord({ draft: finalizedDraft, fallbackTripName, tripId });
  const legs = createLegRecords({ draft: finalizedDraft, tripId });
  const stays = createStayRecords({ draft: finalizedDraft, legs, tripId });
  const transport = createTransportRecords({
    draft: finalizedDraft,
    legs,
    tripId,
  });
  const items = createItemRecords({ draft: finalizedDraft, legs, tripId });
  const categories = createCategoryRecords({ items, tripId });
  const privateDetails = createPrivateDetailRecords({
    draft: finalizedDraft,
    stays,
    transport,
    tripId,
  });
  const days = createDayRecords({ items, legs, transport, tripId });
  const weatherHooks = createWeatherHooks({ days, legs, tripId });

  const records: StructuredTripRecords = {
    categories,
    days,
    items,
    legs,
    photos: [],
    phrases: [],
    privateDetails,
    reviewQuestions: createReviewQuestions({
      draft: finalizedDraft,
      items,
      legs,
      stays,
      tripId,
      transport,
    }),
    stays,
    transport,
    trip,
    weatherHooks,
  };

  assertCanonicalProjectionInvariant({ draft: finalizedDraft, records });

  return records;
}
