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
import { preparePersistedTripDraftForStructuredCompilation } from "@/lib/extraction/canonical-trip-finalization";
import {
  type DraftObject,
  getArray,
  getNumber,
  getObject,
  getString,
  getStringFromKeys,
} from "@/lib/extraction/draft-value";
import { createReviewQuestions } from "@/lib/extraction/review-question-policy";
import {
  cleanTravelerText,
  normalizeText,
} from "@/lib/extraction/traveler-text";
import {
  getStayAddressVisibility,
  shouldCreatePrivateDetailFromDraftSensitiveDetail,
} from "@/lib/trip-privacy-policy";
import {
  canonicalizeTripCategoryId,
  getTripCategoryEmoji,
  getTripCategoryLabel,
} from "@/lib/trip-categories";
import { isRedundantLocalAirportTransferCandidate } from "@/lib/trip-travel-boundary-policy";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "record";
}

function normalizeTransportType(value: string | null): TripTransportType {
  if (
    value === "flight" ||
    value === "train" ||
    value === "ferry" ||
    value === "rental_car" ||
    value === "bus" ||
    value === "drive"
  ) {
    return value;
  }

  if (value === "car") {
    return "rental_car";
  }

  if (value === "transfer") {
    return "transfer";
  }

  return "other";
}

function cleanTransportDescription(
  value: string | null,
  transportType: TripTransportType = "other"
) {
  const description = cleanTravelerText(value);

  if (!description) {
    return null;
  }

  const segments = description
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return description;
  }

  const transportDetailPattern =
    /\b(arrival|arrive|arrives|bag|bags|boarding|bus|car|check[-\s]?in|coach|confirmation|depart|departs|departure|driver|drop[-\s]?off|duration|ferry|flight|gate|land|lands|leave|leaves|luggage|operator|pickup|pick[-\s]?up|platform|provider|rail|reservation|route|seat|station|terminal|ticket|train|transfer|voucher)\b/i;
  const destinationPlanPattern =
    /\b(after arrival|bar|breakfast|cafe|café|cathedral|church|city plans?|dinner|food|gallery|lunch|museum|palace|plans? for|restaurant|shopping|sightseeing|tour|visit|walk|walking)\b/i;
  const lodgingDirectionPattern =
    /\b(hostel|hotel|airbnb|apartment|check[-\s]?in|buzzer|door code|lockbox|metro|subway|tram|directions?|walk to the stay)\b/i;
  const kept = segments.filter(
    (segment) => {
      if (
        (transportType === "flight" || transportType === "train") &&
        lodgingDirectionPattern.test(segment)
      ) {
        return false;
      }

      return (
        transportDetailPattern.test(segment) ||
        !destinationPlanPattern.test(segment)
      );
    }
  );

  return kept.length > 0 ? kept.join(" ") : description;
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
  const canonicalCategory = canonicalizeTripCategoryId(category);

  if (canonicalCategory) {
    return canonicalCategory;
  }

  const text = `${title} ${description ?? ""}`.toLowerCase();

  if (/\b(check[-\s]?in|check[-\s]?out|drop bags?|bag drop|arrival|departure|airport|station|flight|land|lands|pickup|pick[-\s]?up|drop[-\s]?off|rental car)\b/.test(text)) {
    return "arrival_departure";
  }

  if (itemType === "rest_day") {
    return "rest_day";
  }

  if (itemType === "social" || /\b(friend|family|meetup|meet up|visit with)\b/.test(text)) {
    return "social";
  }

  if (/\b(cooking class|cookery|food tour|market tour|tasting class)\b/.test(text)) {
    return "food_class";
  }

  if (/\b(restaurant|dinner|lunch|brunch|breakfast|cafe|café|bar|tapas|winery|brewery|beer hall|food hall|market|meal)\b/.test(text)) {
    return "food_dining";
  }

  if (/\b(pottery|calligraphy|batik|silk|workshop|craft class|art class|hands[-\s]?on)\b/.test(text)) {
    return "art_class";
  }

  if (/\b(temple|shrine|church|cathedral|basilica|mosque|synagogue|religious|st vitus|st\. vitus)\b/.test(text)) {
    return "temple_shrine";
  }

  if (/\b(ticket|tickets|tour|guided|entry|reservation|pass|timed|time travel|walking tour|catacombs|castle|palace)\b/.test(text)) {
    return "tours_tickets";
  }

  if (/\b(museum|gallery|exhibit|exhibition|library|monument|statue|landmark|art|culture|historic|history|communism|kgb|belvedere|albertina|mumok|kafka)\b/.test(text)) {
    return "art_culture";
  }

  if (/\b(zoo|wildlife|sanctuary|aquarium|animal|elephant|whale shark|whale|dolphin)\b/.test(text)) {
    return "animal_experience";
  }

  if (/\b(beach|swim|snorkel|pool|water|boat|kayak|surf|reef)\b/.test(text)) {
    return "beach_water";
  }

  if (/\b(hike|park|garden|trail|mountain|nature|outdoors|viewpoint|scenic spot|gloriette|palm house)\b/.test(text)) {
    return "nature_outdoors";
  }

  if (/\b(shop|shopping|market|tailor|tailoring|souvenir|mall|boutique)\b/.test(text)) {
    return "shopping_tailor";
  }

  if (/\b(spa|massage|sauna|yoga|wellness|relaxation|baths?)\b/.test(text)) {
    return "wellness_relaxation";
  }

  if (/\b(playground|kid|kids|child|children|family[-\s]?friendly|toddler|wren)\b/.test(text)) {
    return "kid_activity";
  }

  if (/\b(show|concert|theater|theatre|performance|ferris wheel|nightlife|club|cocktail|hemingway bar)\b/.test(text)) {
    return "nightlife_entertainment";
  }

  if (/\b(train ride|boat ride|scenic ride|road trip|drive|ferry|cruise|panorama train)\b/.test(text)) {
    return "scenic_ride";
  }

  if (/\b(laundry|grocery|groceries|pack|packing|sim card|pharmacy|errand|admin)\b/.test(text)) {
    return "admin_logistics";
  }

  if (itemType === "admin" || itemType === "note" || itemType === "placeholder") {
    return "admin_logistics";
  }

  return "art_culture";
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

function findLegForText(
  legs: TripLegRecord[],
  title: string,
  description: string | null
) {
  const text = normalizeText([title, description].filter(Boolean).join(" "));

  if (!text) {
    return null;
  }

  return (
    legs.find((leg) =>
      [leg.displayName, leg.city, leg.country]
        .filter(Boolean)
        .some((value) => {
          const normalized = normalizeText(value ?? null);
          return Boolean(normalized) && text.includes(normalized);
        })
    ) ?? null
  );
}

function isGenericStayName(value: string) {
  const normalized = normalizeText(value);
  return (
    /^stay \d+$/.test(normalized) ||
    /^[a-z]+ stay$/.test(normalized) ||
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
      const text = normalizeText(
        [
          getString(item, "prompt"),
          getString(item, "reason"),
          getString(item, "evidence"),
          getString(item, "relatedTitle"),
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        Boolean(guessedValue) &&
        (subjectType === "stay" ||
          text.includes("lodging") ||
          text.includes("hostel") ||
          text.includes("hotel") ||
          text.includes("check in")) &&
        (targetField.includes("title") ||
          targetField.includes("name") ||
          text.includes("lodging title") ||
          text.includes("correct lodging"))
      );
    });

  const matchingCandidate = candidates.find((item) => {
    const relatedTitle = normalizeText(getString(item, "relatedTitle"));
    const prompt = normalizeText(getString(item, "prompt"));
    const reason = normalizeText(getString(item, "reason"));

    return (
      Boolean(normalizedFallback) &&
      ((Boolean(relatedTitle) &&
        (relatedTitle.includes(normalizedFallback) ||
          normalizedFallback.includes(relatedTitle))) ||
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

function getStayDateGuess({
  dateKind,
  draft,
  stayName,
}: {
  dateKind: "checkIn" | "checkOut";
  draft: unknown;
  stayName: string;
}) {
  const normalizedName = normalizeText(stayName);
  const targetPatterns =
    dateKind === "checkIn"
      ? ["checkin", "check in", "check-in", "checkindate", "start"]
      : ["checkout", "check out", "check-out", "checkoutdate", "leave"];
  const candidates = getArray(draft, "missingDetails")
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as DraftObject)
        : null
    )
    .filter((item): item is DraftObject => Boolean(item))
    .filter((item) => {
      const subjectType = getString(item, "subjectType");
      const guessedValue = getString(item, "guessedValue");
      const targetField = normalizeText(getString(item, "targetField"));
      const text = normalizeText(
        [
          getString(item, "prompt"),
          getString(item, "reason"),
          getString(item, "evidence"),
          getString(item, "relatedTitle"),
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        subjectType === "stay" &&
        isIsoDate(guessedValue) &&
        targetPatterns.some(
          (pattern) => targetField.includes(pattern) || text.includes(pattern)
        )
      );
    });

  const matchingCandidate = candidates.find((item) => {
    const relatedTitle = normalizeText(getString(item, "relatedTitle"));
    const prompt = normalizeText(getString(item, "prompt"));
    const reason = normalizeText(getString(item, "reason"));

    return (
      Boolean(normalizedName) &&
      ((Boolean(relatedTitle) &&
        (relatedTitle.includes(normalizedName) ||
          normalizedName.includes(relatedTitle))) ||
        prompt.includes(normalizedName) ||
        reason.includes(normalizedName))
    );
  });

  return getString(matchingCandidate ?? null, "guessedValue");
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
    const nextPlace = places[index + 1];
    const nextPlaceObject =
      nextPlace && typeof nextPlace === "object" && !Array.isArray(nextPlace)
        ? (nextPlace as DraftObject)
        : null;
    const city = getString(place, "city") ?? `Stop ${index + 1}`;
    const country = getString(place, "country");
    const key = slugify([city, country].filter(Boolean).join("-"));
    const arriveDate = getString(place, "arriveDate");
    const explicitLeaveDate = getString(place, "leaveDate");
    const nextArriveDate = getString(nextPlaceObject, "arriveDate");
    const leaveDate =
      explicitLeaveDate ??
      (arriveDate && nextArriveDate && nextArriveDate > arriveDate
        ? nextArriveDate
        : null);

    return {
      arriveDate,
      city,
      country,
      displayName: city,
      id: `${tripId}-leg-${key}-${index + 1}`,
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
    const guessedCheckIn = getStayDateGuess({
      dateKind: "checkIn",
      draft,
      stayName: name,
    });
    const guessedCheckOut = getStayDateGuess({
      dateKind: "checkOut",
      draft,
      stayName: name,
    });
    const checkIn =
      getString(stay, "checkIn") ??
      getString(stay, "firstNightDate") ??
      (rawCheckOut && nights && nights > 0 ? subtractDays(rawCheckOut, nights) : null) ??
      guessedCheckIn;
    const leg = findLegForDate(legs, checkIn);
    const inferredCheckOut =
      checkIn && leg?.leaveDate && leg.leaveDate > checkIn
        ? leg.leaveDate
        : null;
    const checkOut =
      rawCheckOut ??
      (checkIn && nights && nights > 0 ? addDays(checkIn, nights) : null) ??
      guessedCheckOut ??
      inferredCheckOut;
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
  return getArray(draft, "transport").map((item, index) => {
    const transport = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title =
      cleanTravelerText(getString(transport, "title")) ?? `Transport ${index + 1}`;
    const date = getString(transport, "date");
    const leg = findLegForDate(legs, date);
    const transportType = normalizeTransportType(getString(transport, "type"));
    const description = cleanTransportDescription(
      getString(transport, "description"),
      transportType
    );
    const departure = getString(transport, "departure");
    const arrival = getString(transport, "arrival");
    const provider = getString(transport, "provider");
    const confirmation = getString(transport, "confirmation");
    const redundantLocalAirportTransfer =
      isRedundantLocalAirportTransferCandidate({
        arrivalLocation: arrival,
        confirmationLabel: confirmation,
        departureLocation: departure,
        description,
        provider,
        title,
        transportType,
      });

    return {
      arrivalLocation: arrival,
      arrivalTime: getStringFromKeys(transport, ["arrivalTime", "endTime"]),
      bookingUrl: null,
      bookingUrlVisibility: "traveler_password",
      confirmationLabel: confirmation,
      confirmationVisibility: confirmation
        ? "traveler_password"
        : "public",
      date,
      departureLocation: departure,
      departureTime: getStringFromKeys(transport, [
        "departureTime",
        "startTime",
        "time",
      ]),
      description,
      fromLegId: null,
      id: `${tripId}-transport-${slugify(title)}-${index + 1}`,
      legId: leg?.id ?? null,
      privateDetailIds: [],
      provider,
      reviewRequired: redundantLocalAirportTransfer ? false : !date,
      routeLabel: title,
      sourceConfidence: "medium",
      status: redundantLocalAirportTransfer ? "ignored" : "draft",
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
    const title =
      cleanTravelerText(getString(activity, "title")) ?? `Activity ${index + 1}`;
    const description = cleanTravelerText(getString(activity, "description"));
    const date = getString(activity, "date");
    const originalItemType = normalizeItemType(
      getString(activity, "itemType"),
      title,
      description
    );
    const itemType = originalItemType;
    const startTime = getString(activity, "startTime");
    const endTime = getString(activity, "endTime");
    const sourceCategory = getString(activity, "category");
    const candidateLeg =
      findLegForDate(legs, date) ?? findLegForText(legs, title, description);
    const finalDate = date;
    const leg = candidateLeg;
    const categoryId = normalizeCategoryId({
      category: sourceCategory,
      description,
      itemType,
      title,
    });

    return {
      address: getString(activity, "address"),
      categoryId,
      date: finalDate,
      description,
      endTime,
      id: `${tripId}-item-${slugify(title)}-${index + 1}`,
      itemType,
      latitude: null,
      legId: leg?.id ?? null,
      locationName: null,
      longitude: null,
      parentItemId: null,
      reviewRequired: itemType === "note" ? false : !finalDate,
      sortOrder: index,
      sourceConfidence: "medium",
      startTime,
      status: !finalDate && itemType !== "note" ? "needs_review" : "draft",
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
      reason: "Exact private rental and residence addresses should default behind traveler mode.",
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
  const finalizedDraft = preparePersistedTripDraftForStructuredCompilation(draft);
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

  return {
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
}
