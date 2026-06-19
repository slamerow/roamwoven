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

function getNumber(value: DraftObject | null, key: string) {
  const child = value?.[key];

  if (typeof child === "number" && Number.isFinite(child)) {
    return child;
  }

  if (typeof child === "string" && child.trim()) {
    const parsed = Number(child);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getConfidence(value: string | null): TripSourceConfidence {
  return value === "low" || value === "high" ? value : "medium";
}

function hasHumanConfidentEvidence(...values: Array<string | null>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();

  if (
    /\b(ambiguous|unclear|possible|probably|suggests|implies|might|maybe)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    /\b(source|document|confirmation|reservation|itinerary|pdf)\s+(says|states|shows|lists|includes|explicitly)\b/.test(text) ||
    /\b(says|states|shows|lists|includes|explicitly)\b/.test(text) ||
    /\b\d+\s+night(s)?\b/.test(text) ||
    /\bcheck[-\s]?in\b/.test(text) ||
    /\bcheck[-\s]?out\b/.test(text) ||
    /\b(arrival|arrive|arrives|land|lands|departure|depart|departs|overnight flight|no hotel|bag drop|same day|sequence|follows|then|after|before|next)\b/.test(
      text
    )
  );
}

function isCorePlanningTarget({
  subjectType,
  targetField,
}: {
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  const normalizedTarget = targetField?.toLowerCase() ?? "";

  if (subjectType === "stay") {
    return (
      normalizedTarget.includes("date") ||
      normalizedTarget.includes("checkin") ||
      normalizedTarget.includes("check-in") ||
      normalizedTarget.includes("checkout") ||
      normalizedTarget.includes("check-out")
    );
  }

  if (subjectType === "transport") {
    return (
      normalizedTarget.includes("date") ||
      normalizedTarget.includes("time") ||
      normalizedTarget.includes("departure") ||
      normalizedTarget.includes("arrival")
    );
  }

  if (subjectType === "item") {
    return normalizedTarget.includes("date") || normalizedTarget.includes("time");
  }

  if (subjectType === "leg") {
    return normalizedTarget.includes("date") || normalizedTarget.includes("city");
  }

  return false;
}

function isOptionalMissingDetail({
  prompt,
  reason,
  subjectId,
  subjectType,
  targetField,
}: {
  prompt: string | null;
  reason: string | null;
  subjectId: string | null;
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  if (!subjectId) {
    return false;
  }

  const target = targetField?.toLowerCase().split("/").pop() ?? "";
  const text = [prompt, reason, targetField].filter(Boolean).join(" ").toLowerCase();

  if (
    subjectType === "transport" &&
    (target.includes("provider") ||
      target.includes("company") ||
      /\b(company|provider|operator|rental car company)\b/.test(text))
  ) {
    return true;
  }

  if (
    subjectType === "item" &&
    (target.includes("url") || target.includes("website"))
  ) {
    return true;
  }

  return false;
}

function isPublicVenueAddressDetail({
  detailType,
  title,
}: {
  detailType: string;
  title: string;
}) {
  const normalizedType = detailType.toLowerCase();

  if (
    !normalizedType.includes("address") &&
    !normalizedType.includes("location")
  ) {
    return false;
  }

  const normalizedTitle = title.toLowerCase();
  const publicVenuePattern =
    /\b(bar|bistro|cafe|café|church|gallery|landmark|market|museum|restaurant|shop|shopping|station|store|venue|watch|watches)\b/;
  const privatePlacePattern =
    /\b(access|airbnb|apartment|door|flat|gate|home|host|hotel|hostel|lodging|lock|rental|residence|room|stay)\b/;

  return (
    publicVenuePattern.test(normalizedTitle) &&
    !privatePlacePattern.test(normalizedTitle)
  );
}

function getQuestionClusterKey(question: TripReviewQuestionRecord) {
  const target = question.targetField?.toLowerCase() ?? "";

  if (
    target.includes("date") ||
    target.includes("checkin") ||
    target.includes("check-in") ||
    target.includes("checkout") ||
    target.includes("check-out")
  ) {
    return "date";
  }

  if (
    target.includes("provider") ||
    target.includes("company") ||
    /\b(company|provider|operator)\b/i.test(question.prompt)
  ) {
    return "provider";
  }

  if (target.includes("name") || target.includes("title")) {
    return "title";
  }

  return (
    target ||
    question.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 3)
      .slice(0, 4)
      .join("-") ||
    "general"
  );
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

function subtractDays(value: string, days: number) {
  return addDays(value, -days);
}

function normalizeText(value: string | null) {
  return value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
}

function isGenericStayName(value: string) {
  const normalized = normalizeText(value);
  return (
    /^stay \d+$/.test(normalized) ||
    normalized.includes("rome stay") ||
    normalized.includes("vienna stay") ||
    normalized.includes("budapest stay") ||
    normalized.includes("hostel stay") ||
    normalized.includes("lodging")
  );
}

function getStayNameGuess({
  draft,
  fallbackName,
}: {
  draft: unknown;
  fallbackName: string;
}) {
  const normalizedFallback = normalizeText(fallbackName);
  const candidates = getArray(draft, "missingDetails")
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as DraftObject)
        : null
    )
    .filter((item): item is DraftObject => Boolean(item))
    .filter((item) => {
      const subjectType = getString(item, "subjectType");
      const targetField = normalizeText(getString(item, "targetField"));
      const guessedValue = getString(item, "guessedValue");

      return (
        subjectType === "stay" &&
        Boolean(guessedValue) &&
        (targetField.includes("title") || targetField.includes("name"))
      );
    });

  const matchingCandidate = candidates.find((item) => {
    const relatedTitle = normalizeText(getString(item, "relatedTitle"));
    const prompt = normalizeText(getString(item, "prompt"));
    const reason = normalizeText(getString(item, "reason"));

    return (
      Boolean(normalizedFallback) &&
      (relatedTitle.includes(normalizedFallback) ||
        normalizedFallback.includes(relatedTitle) ||
        prompt.includes(normalizedFallback) ||
        reason.includes(normalizedFallback))
    );
  });

  return (
    getString(matchingCandidate ?? null, "guessedValue") ??
    (isGenericStayName(fallbackName) && candidates.length === 1
      ? getString(candidates[0], "guessedValue")
      : null)
  );
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
    const fallbackName = getString(stay, "name") ?? `Stay ${index + 1}`;
    const name =
      getStayNameGuess({ draft, fallbackName }) ?? fallbackName;
    const nights = getNumber(stay, "nights");
    const rawCheckOut = getString(stay, "checkOut");
    const checkIn =
      getString(stay, "checkIn") ??
      getString(stay, "firstNightDate") ??
      (rawCheckOut && nights && nights > 0 ? subtractDays(rawCheckOut, nights) : null);
    const checkOut =
      rawCheckOut ??
      (checkIn && nights && nights > 0 ? addDays(checkIn, nights) : null);
    const leg = findLegForDate(legs, checkIn);

    return {
      accessDetailsVisibility: "traveler_password",
      address: getString(stay, "address"),
      addressVisibility: getString(stay, "address")
        ? "traveler_password"
        : "public",
      bookingUrl: null,
      checkInDate: checkIn,
      checkInTime: getString(stay, "checkInTime"),
      checkOutDate: checkOut,
      checkOutTime: getString(stay, "checkOutTime"),
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

  const sensitive = getArray(draft, "sensitiveDetails").flatMap((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(detail, "title") ?? `Sensitive detail ${index + 1}`;
    const detailType = getString(detail, "detailType") ?? "sensitive_detail";

    if (isPublicVenueAddressDetail({ detailType, title })) {
      return [];
    }

    return [{
      detailType,
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
    }];
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
  function getTargetValue({
    subjectId,
    subjectType,
    targetField,
  }: {
    subjectId: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
    targetField: string | null;
  }) {
    if (!subjectId || !targetField) {
      return null;
    }

    const record =
      subjectType === "item"
        ? items.find((item) => item.id === subjectId)
        : subjectType === "stay"
          ? stays.find((stay) => stay.id === subjectId)
          : subjectType === "transport"
            ? transport.find((item) => item.id === subjectId)
            : subjectType === "leg"
              ? legs.find((leg) => leg.id === subjectId)
              : null;

    if (!record || !(targetField in record)) {
      return null;
    }

    const value = record[targetField as keyof typeof record];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function shouldTreatAsNote({
    answerType,
    confidence,
    evidence,
    guessedValue,
    prompt,
    reason,
    subjectId,
    subjectType,
    targetField,
  }: {
    answerType: TripReviewQuestionRecord["answerType"];
    confidence: TripSourceConfidence;
    evidence: string | null;
    guessedValue: string | null;
    prompt: string | null;
    reason: string | null;
    subjectId: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
    targetField: string | null;
  }) {
    const normalizedTarget = targetField?.toLowerCase() ?? "";

    if (
      normalizedTarget.includes("visibility") ||
      normalizedTarget.includes("confirmation")
    ) {
      return true;
    }

    if (subjectType === "trip" && guessedValue) {
      return true;
    }

    if (
      subjectType === "stay" &&
      guessedValue &&
      (normalizedTarget.includes("title") ||
        normalizedTarget.includes("name") ||
        normalizedTarget.includes("date"))
    ) {
      return true;
    }

    if (answerType === "confirm" && guessedValue && confidence === "high") {
      return true;
    }

    if (
      guessedValue &&
      getTargetValue({ subjectId, subjectType, targetField })
    ) {
      if (
        isCorePlanningTarget({ subjectType, targetField }) &&
        confidence !== "high" &&
        !hasHumanConfidentEvidence(prompt, reason, evidence)
      ) {
        return false;
      }

      return true;
    }

    return false;
  }

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

  return getArray(draft, "missingDetails").flatMap((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const relatedTitle = getString(detail, "relatedTitle");
    const subjectType = getReviewSubjectType(getString(detail, "subjectType"));
    const subjectId = findSubjectId(subjectType, relatedTitle);
    const answerType = getAnswerType(getString(detail, "answerType"));
    const confidence = getConfidence(getString(detail, "confidence"));
    const evidence = getString(detail, "evidence");
    const guessedValue = getString(detail, "guessedValue");
    const prompt = getString(detail, "prompt");
    const reason = getString(detail, "reason");
    const targetField = getString(detail, "targetField");

    const status: TripReviewQuestionRecord["status"] =
      isOptionalMissingDetail({
        prompt,
        reason,
        subjectId,
        subjectType,
        targetField,
      }) ||
      shouldTreatAsNote({
        answerType,
        confidence,
        evidence,
        guessedValue,
        prompt,
        reason,
        subjectId,
        subjectType,
        targetField,
      })
      ? "noted"
      : "open";

    return [{
      answerType,
      answerValue: null,
      createdAt: null,
      evidence,
      guessedValue,
      id: `${tripId}-question-${index + 1}`,
      prompt: prompt ?? "Confirm a missing detail",
      reason:
        reason ??
        "This detail affects the generated traveler app.",
      resolvedAt: null,
      sourceConfidence: confidence,
      status,
      subjectId,
      subjectType,
      targetField,
      tripId,
    }];
  }).filter((question, index, questions) => {
    if (question.status !== "open") {
      return true;
    }

    return (
      questions.findIndex(
        (candidate) =>
          candidate.status === "open" &&
          candidate.subjectId === question.subjectId &&
          candidate.subjectType === question.subjectType &&
          getQuestionClusterKey(candidate) === getQuestionClusterKey(question)
      ) === index
    );
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
