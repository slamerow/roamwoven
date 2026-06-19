import type {
  StructuredTripRecords,
  TripCategoryRecord,
  TripItemRecord,
  TripLegRecord,
  TripPrivateDetailRecord,
  TripReviewQuestionRecord,
  TripStayRecord,
  TripSummaryRecord,
  TripTransportRecord,
  TripTransportType,
  TripItemType,
  TripSourceConfidence,
  TripWeatherHookRecord,
} from "@/lib/generated-trip-model";

type DraftObject = Record<string, unknown>;

const defaultCategoryLabels: Record<string, { emoji: string; label: string }> = {
  activity: { emoji: "✨", label: "Activities" },
  admin_logistics: { emoji: "📋", label: "Admin and logistics" },
  arrival_departure: { emoji: "✈️", label: "Arrival and departure" },
  art_class: { emoji: "🖌️", label: "Art classes" },
  art_culture: { emoji: "🎨", label: "Art and culture" },
  beach_water: { emoji: "🏖️", label: "Beach and water" },
  food_class: { emoji: "👨‍🍳", label: "Food classes" },
  food_dining: { emoji: "🍜", label: "Food and dining" },
  kid_activity: { emoji: "🧸", label: "Kid activities" },
  nature_outdoors: { emoji: "🌿", label: "Nature and outdoors" },
  note: { emoji: "•", label: "Notes" },
  rest_day: { emoji: "😴", label: "Rest days" },
  scenic_ride: { emoji: "🚗", label: "Scenic rides" },
  shopping_tailor: { emoji: "🛍️", label: "Shopping and tailoring" },
  social: { emoji: "👥", label: "Social" },
  temple_shrine: { emoji: "⛩️", label: "Temples and shrines" },
  transport: { emoji: "🚆", label: "Transport" },
  wellness_and_relaxation: { emoji: "💆", label: "Wellness and relaxation" },
};

function getCategoryLabel(categoryId: string) {
  const category = defaultCategoryLabels[categoryId];

  if (category) {
    return category.label;
  }

  return categoryId
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCategoryEmoji(categoryId: string) {
  return defaultCategoryLabels[categoryId]?.emoji ?? "•";
}

function getObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const child = (value as DraftObject)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? (child as DraftObject)
    : null;
}

function getArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const child = (value as DraftObject)[key];
  return Array.isArray(child) ? child : [];
}

function getString(value: DraftObject | null, key: string) {
  const child = value?.[key];
  return typeof child === "string" && child.trim() ? child.trim() : null;
}

function getConfidence(value: string | null): TripSourceConfidence {
  return value === "low" || value === "high" ? value : "medium";
}

function getAnswerType(
  value: string | null
): TripReviewQuestionRecord["answerType"] {
  if (
    value === "date" ||
    value === "time" ||
    value === "visibility" ||
    value === "confirm"
  ) {
    return value;
  }

  return "text";
}

function getReviewSubjectType(
  value: string | null
): TripReviewQuestionRecord["subjectType"] {
  if (
    value === "day" ||
    value === "leg" ||
    value === "stay" ||
    value === "transport" ||
    value === "item"
  ) {
    return value;
  }

  return "trip";
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "record";
}

function normalizeTransportType(value: string | null): TripTransportType {
  if (value === "flight" || value === "train" || value === "ferry") {
    return value;
  }

  if (value === "car") {
    return "drive";
  }

  if (value === "transfer") {
    return "transfer";
  }

  return "other";
}

function normalizeItemType(value: string | null, title: string, description: string | null): TripItemType {
  if (
    value === "activity" ||
    value === "note" ||
    value === "admin" ||
    value === "rest_day" ||
    value === "social" ||
    value === "placeholder"
  ) {
    return value;
  }

  const text = `${title} ${description ?? ""}`.toLowerCase();

  if (
    /\b(restaurant|dinner|lunch|brunch|breakfast|cafe|café|bar|tapas|winery)\b/.test(
      text
    )
  ) {
    return "activity";
  }

  if (/\b(tbd|to confirm|placeholder)\b/.test(text)) {
    return "placeholder";
  }

  return "activity";
}

function normalizeCategoryId({
  category,
  description,
  itemType,
  title,
}: {
  category: string | null;
  description: string | null;
  itemType: TripItemType;
  title: string;
}) {
  const normalized = category?.trim().replaceAll("&", "and");

  if (normalized) {
    return normalized;
  }

  if (/\b(restaurant|dinner|lunch|brunch|breakfast|cafe|café|bar|tapas|winery)\b/.test(
    `${title} ${description ?? ""}`.toLowerCase()
  )) {
    return "food_dining";
  }

  if (itemType === "admin") {
    return "admin_logistics";
  }

  if (itemType === "rest_day") {
    return "rest_day";
  }

  if (itemType === "note" || itemType === "placeholder") {
    return "note";
  }

  const text = `${title} ${description ?? ""}`.toLowerCase();

  if (/\b(beach|swim|snorkel|pool|water)\b/.test(text)) {
    return "beach_water";
  }

  if (/\b(hike|park|garden|trail|mountain|nature|outdoors)\b/.test(text)) {
    return "nature_outdoors";
  }

  if (/\b(museum|gallery|festival|temple|church|mosque|palace|art|culture)\b/.test(text)) {
    return "art_culture";
  }

  if (/\b(shop|market|tailor|souvenir)\b/.test(text)) {
    return "shopping_tailor";
  }

  if (/\b(train|drive|ferry|transfer|bus|ride)\b/.test(text)) {
    return "scenic_ride";
  }

  return "activity";
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
  const dateRange = getString(overview, "dateRange");

  return {
    destinationSummary: getString(overview, "destinationSummary"),
    endDate: null,
    id: tripId,
    name: fallbackTripName,
    startDate: null,
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
  return getArray(draft, "places").map((item, index) => {
    const place = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const city = getString(place, "city") ?? `Stop ${index + 1}`;
    const country = getString(place, "country");
    const key = slugify([city, country].filter(Boolean).join("-"));

    return {
      arriveDate: getString(place, "arriveDate"),
      city,
      country,
      displayName: city,
      id: `${tripId}-leg-${key}-${index + 1}`,
      language: null,
      latitude: null,
      leaveDate: getString(place, "leaveDate"),
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
    const name = getString(stay, "name") ?? `Stay ${index + 1}`;
    const checkIn = getString(stay, "checkIn");
    const leg = findLegForDate(legs, checkIn);

    return {
      accessDetailsVisibility: "traveler_password",
      address: getString(stay, "address"),
      addressVisibility: getString(stay, "address")
        ? "traveler_password"
        : "public",
      bookingUrl: null,
      checkInDate: checkIn,
      checkInTime: null,
      checkOutDate: getString(stay, "checkOut"),
      checkOutTime: null,
      confirmationLabel: null,
      confirmationVisibility: "traveler_password",
      id: `${tripId}-stay-${slugify(name)}-${index + 1}`,
      latitude: null,
      legId: leg?.id ?? null,
      longitude: null,
      name,
      privateDetailIds: [],
      publicLocationLabel: leg?.displayName ?? null,
      reviewRequired: !checkIn,
      sourceConfidence: "medium",
      status: "draft",
      stayType: null,
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
  return getArray(draft, "transport").map((item, index) => {
    const transport = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(transport, "title") ?? `Transport ${index + 1}`;
    const date = getString(transport, "date");
    const leg = findLegForDate(legs, date);

    return {
      arrivalLocation: getString(transport, "arrival"),
      arrivalTime: null,
      bookingUrl: null,
      bookingUrlVisibility: "traveler_password",
      confirmationLabel: getString(transport, "confirmation"),
      confirmationVisibility: getString(transport, "confirmation")
        ? "traveler_password"
        : "public",
      date,
      departureLocation: getString(transport, "departure"),
      departureTime: null,
      description: null,
      fromLegId: null,
      id: `${tripId}-transport-${slugify(title)}-${index + 1}`,
      legId: leg?.id ?? null,
      privateDetailIds: [],
      provider: getString(transport, "provider"),
      reviewRequired: !date,
      routeLabel: title,
      sourceConfidence: "medium",
      status: "draft",
      toLegId: null,
      transportType: normalizeTransportType(getString(transport, "type")),
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
    const title = getString(activity, "title") ?? `Activity ${index + 1}`;
    const description = getString(activity, "description");
    const date = getString(activity, "date");
    const leg = findLegForDate(legs, date);
    const itemType = normalizeItemType(
      getString(activity, "itemType"),
      title,
      description
    );
    const categoryId = normalizeCategoryId({
      category: getString(activity, "category"),
      description,
      itemType,
      title,
    });

    return {
      address: getString(activity, "address"),
      categoryId,
      date,
      description,
      endTime: getString(activity, "endTime"),
      id: `${tripId}-item-${slugify(title)}-${index + 1}`,
      itemType,
      latitude: null,
      legId: leg?.id ?? null,
      locationName: null,
      longitude: null,
      parentItemId: null,
      reviewRequired: !date,
      sortOrder: index,
      sourceConfidence: "medium",
      startTime: getString(activity, "startTime"),
      status: !date ? "needs_review" : "draft",
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
    description: getCategoryLabel(key),
    emoji: getCategoryEmoji(key),
    enabled: true,
    icon: null,
    id: key,
    label: getCategoryLabel(key),
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
    .filter((stay) => stay.address)
    .map((stay) => ({
      detailType: "private_address",
      id: `${stay.id}-address`,
      label: "Exact stay address",
      reason: "Exact lodging addresses should default behind traveler mode.",
      reviewRequired: false,
      sourceConfidence: "medium" as const,
      subjectId: stay.id,
      subjectType: "stay" as const,
      tripId,
      value: stay.address ?? "",
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
      subjectId: item.id,
      subjectType: "transport" as const,
      tripId,
      value: item.confirmationLabel ?? "",
      visibility: "traveler_password" as const,
    }));

  const sensitive = getArray(draft, "sensitiveDetails").map((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(detail, "title") ?? `Sensitive detail ${index + 1}`;

    return {
      detailType: getString(detail, "detailType") ?? "sensitive_detail",
      id: `${tripId}-sensitive-${index + 1}`,
      label: title,
      reason: getString(detail, "reason"),
      reviewRequired: true,
      sourceConfidence: "medium" as const,
      subjectId: tripId,
      subjectType: "leg" as const,
      tripId,
      value: title,
      visibility: "traveler_password" as const,
    };
  });

  return [...stayDetails, ...transportDetails, ...sensitive];
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

function createReviewQuestions({
  draft,
  items,
  legs,
  stays,
  tripId,
  transport,
}: {
  draft: unknown;
  items: TripItemRecord[];
  legs: TripLegRecord[];
  stays: TripStayRecord[];
  tripId: string;
  transport: TripTransportRecord[];
}): TripReviewQuestionRecord[] {
  const findSubjectId = (
    subjectType: TripReviewQuestionRecord["subjectType"],
    relatedTitle: string | null
  ) => {
    if (!relatedTitle) {
      return null;
    }

    const normalized = relatedTitle.toLowerCase();

    if (subjectType === "item") {
      return (
        items.find((item) => item.title.toLowerCase() === normalized)?.id ??
        items.find((item) => item.title.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    if (subjectType === "stay") {
      return (
        stays.find((stay) => stay.name.toLowerCase() === normalized)?.id ??
        stays.find((stay) => stay.name.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    if (subjectType === "transport") {
      return (
        transport.find((item) => item.routeLabel.toLowerCase() === normalized)?.id ??
        transport.find((item) => item.routeLabel.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    if (subjectType === "leg") {
      return (
        legs.find((leg) => leg.displayName.toLowerCase() === normalized)?.id ??
        legs.find((leg) => leg.displayName.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    return null;
  };

  return getArray(draft, "missingDetails").map((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const relatedTitle = getString(detail, "relatedTitle");
    const subjectType = getReviewSubjectType(getString(detail, "subjectType"));
    const subjectId = findSubjectId(subjectType, relatedTitle);

    return {
      answerType: getAnswerType(getString(detail, "answerType")),
      answerValue: null,
      createdAt: null,
      evidence: getString(detail, "evidence"),
      guessedValue: getString(detail, "guessedValue"),
      id: `${tripId}-question-${index + 1}`,
      prompt: getString(detail, "prompt") ?? "Confirm a missing detail",
      reason:
        getString(detail, "reason") ??
        "This detail affects the generated traveler app.",
      resolvedAt: null,
      sourceConfidence: getConfidence(getString(detail, "confidence")),
      status: "open",
      subjectId,
      subjectType,
      targetField: getString(detail, "targetField"),
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

export function createStructuredTripRecordsFromDraft({
  draft,
  fallbackTripName,
  tripId,
}: {
  draft: unknown;
  fallbackTripName: string;
  tripId: string;
}): StructuredTripRecords {
  const trip = createTripRecord({ draft, fallbackTripName, tripId });
  const legs = createLegRecords({ draft, tripId });
  const stays = createStayRecords({ draft, legs, tripId });
  const transport = createTransportRecords({ draft, legs, tripId });
  const items = createItemRecords({ draft, legs, tripId });
  const categories = createCategoryRecords({ items, tripId });
  const privateDetails = createPrivateDetailRecords({
    draft,
    stays,
    transport,
    tripId,
  });
  const days = createDayRecords({ items, legs, transport, tripId });
  const weatherHooks = createWeatherHooks({ days, legs, tripId });

  return {
    categories,
    days,
    items,
    legs,
    photos: [],
    phrases: [],
    privateDetails,
    reviewQuestions: createReviewQuestions({
      draft,
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
}
