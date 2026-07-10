import { type DraftObject } from "@/lib/extraction/draft-value";
import {
  ASSEMBLY_VERSION,
  createEmptyConsolidationDebug,
  getExistingAssemblyDebug,
  type TripDraftConsolidationDebug,
} from "@/lib/extraction/trip-draft-consolidation-debug";
import { normalizeText } from "@/lib/extraction/traveler-text";
import {
  classifyDraftActivityCard,
  getDraftActivityGroupingKind,
  hasStandaloneActivityAnchor,
  isMakerVisibleGroupingKind,
  isPlannedAreaActivityGroup,
  isSameSiteActivityGroup,
  isTourActivityGroup,
  type GroupingKind,
} from "@/lib/trip-card-taxonomy";
import {
  hasTransportTimeEvidence,
  isCriticalTransportRecord,
  type TransportCompletenessRecord,
} from "@/lib/trip-transport-policy";
import {
  inferTravelBoundaryTransportKind,
  isRentalCarPickupCandidate,
  isScenicRideCandidate,
  isSeparateLocalMovementCandidate,
  isTravelActionCandidate,
  shouldBeTravelRow,
  type TravelBoundaryTransportType,
  type TravelBoundaryRecord,
} from "@/lib/trip-travel-boundary-policy";

type NoteSectionName =
  | "Food"
  | "Drinks & Nightlife"
  | "Shopping"
  | "Local Notes"
  | "Possible Sights";

type AssemblyMissingDetail = {
  answerType: "confirm" | "text" | "choice" | "date";
  assemblySource: "trip_assembly";
  confidence: "high" | "medium";
  evidence: string | null;
  guessedValue: string | null;
  prompt: string;
  reason: string;
  relatedTitle: string | null;
  subjectType: "item" | "transport";
  targetField: "date" | "departureTime" | "placement" | "presentation";
};

const NOTE_SECTION_ORDER: NoteSectionName[] = [
  "Food",
  "Drinks & Nightlife",
  "Shopping",
  "Local Notes",
  "Possible Sights",
];

function asRecord(value: unknown): DraftObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftObject)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(record: DraftObject, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getStringFromKeys(record: DraftObject, keys: string[]) {
  for (const key of keys) {
    const value = getString(record, key);

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeWords(value: string | null | undefined) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter(
      (word) =>
        ![
          "and",
          "the",
          "for",
          "with",
          "from",
          "into",
          "tour",
          "walk",
          "day",
          "trip",
          "city",
          "sights",
          "sightseeing",
          "activity",
          "visit",
          "museum",
          "note",
          "notes",
          "tip",
          "tips",
          "idea",
          "ideas",
          "recommendation",
          "recommendations",
        ].includes(word)
    );
}

function cloneRecord(record: DraftObject) {
  return { ...record };
}

function cloneRecordArray(value: unknown) {
  return asArray(value)
    .map((item) => {
      const record = asRecord(item);
      return Object.keys(record).length ? cloneRecord(record) : null;
    })
    .filter((item): item is DraftObject => Boolean(item));
}

function textFor(record: DraftObject, keys: string[] = ["title", "description"]) {
  return keys
    .map((key) => getString(record, key))
    .filter(Boolean)
    .join(" ");
}

function dateFor(record: DraftObject) {
  return getString(record, "date");
}

function timeFor(record: DraftObject) {
  return getStringFromKeys(record, ["startTime", "time", "departureTime"]);
}

function toDraftActivityInput(activity: DraftObject) {
  return {
    category: getString(activity, "category"),
    date: dateFor(activity),
    description: getString(activity, "description"),
    endTime: getString(activity, "endTime"),
    isRentalCarAction: isRentalCarText(textFor(activity)),
    isTransportAction: isTransportActionText(textFor(activity)),
    itemType: getString(activity, "itemType"),
    startTime: timeFor(activity),
    title: getString(activity, "title"),
  };
}

function classifyDraftActivity(activity: DraftObject) {
  return classifyDraftActivityCard(toDraftActivityInput(activity));
}

function normalizeClockTime(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  const match = /^(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toLowerCase();

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (suffix === "pm" && hour < 12) {
    hour += 12;
  } else if (suffix === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string | null | undefined) {
  const normalized = normalizeClockTime(value);

  if (!normalized) {
    return null;
  }

  const [hour, minute] = normalized.split(":").map(Number);

  return hour * 60 + minute;
}

function extractClockTimes(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  const matches = value.matchAll(
    /\b(?:at\s*)?(\d{1,2})(?:(?::(\d{2})\s*(am|pm)?)|\s*(am|pm))\b/gi
  );
  const times: string[] = [];

  for (const match of matches) {
    const time = normalizeClockTime(
      `${match[1]}:${match[2] ?? "00"}${match[3] ?? match[4] ? ` ${match[3] ?? match[4]}` : ""}`
    );

    if (time && !times.includes(time)) {
      times.push(time);
    }
  }

  return times;
}

function firstKnownTime(record: DraftObject, keys: string[]) {
  return normalizeClockTime(getStringFromKeys(record, keys));
}

function travelBoundaryRecordForDraft(record: DraftObject): TravelBoundaryRecord {
  return {
    arrivalLocation: getString(record, "arrival"),
    category: getString(record, "category"),
    confirmationLabel: getStringFromKeys(record, [
      "confirmation",
      "reservation",
      "bookingNumber",
      "orderNumber",
    ]),
    departureLocation: getString(record, "departure") ?? getString(record, "address"),
    description: getString(record, "description"),
    itemType: getString(record, "itemType"),
    provider: getString(record, "provider"),
    title: getString(record, "title"),
    transportType: getString(record, "type"),
  };
}

function isRentalCarText(value: string | null | undefined) {
  return isRentalCarPickupCandidate({ title: value });
}

function isScenicRideOrAttractionText(value: string | null | undefined) {
  return isScenicRideCandidate({ title: value });
}

function isTransportActionText(value: string) {
  return isTravelActionCandidate({ title: value });
}

function normalizeRentalCarTitle(transport: DraftObject) {
  const title = getString(transport, "title");
  const type = normalizeText(getString(transport, "type"));

  if (!title || type !== "rental car") {
    return;
  }

  const normalized = normalizeText(title);
  const destinationMatch =
    normalized.match(/\b(?:car pickup|pickup car|pick up car|rental car)(?:\s+(?:for|to))\s+(.+)$/) ??
    normalized.match(/\b(?:for|to)\s+(.+)$/);

  if (destinationMatch?.[1]) {
    const destination = destinationMatch[1]
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    transport.title = `Pick up rental car for ${destination}`;
    return;
  }

  if (/\b(car pickup|pickup car|pick up car|rental car)\b/.test(normalized)) {
    transport.title = "Pick up rental car";
  }
}

function normalizedRentalCarPickupTitle(record: DraftObject) {
  const title = getString(record, "title");
  const text = normalizeText(title);

  if (!title || !isRentalCarText(text)) {
    return title ?? "Pick up rental car";
  }

  const destinationMatch =
    text.match(/\b(?:car pickup|pickup car|pick up car|rental car)(?:\s+(?:for|to))\s+(.+)$/) ??
    text.match(/\b(?:for|to)\s+(.+)$/);

  if (destinationMatch?.[1]) {
    const destination = destinationMatch[1]
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return `Pick up rental car for ${destination}`;
  }

  return "Pick up rental car";
}

function isRentalCarTransport(record: DraftObject) {
  return isRentalCarPickupCandidate(travelBoundaryRecordForDraft(record));
}

function isSeparateLocalMovement(value: string) {
  return isSeparateLocalMovementCandidate({ title: value });
}

function hasArrivalDepartureCategory(record: DraftObject) {
  return normalizeText(getString(record, "category")) === "arrival departure";
}

function extractIataRoute(value: string | null | undefined) {
  const match = value?.match(/\b([A-Z]{3})\s*(?:->|→|to)\s*([A-Z]{3})\b/);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    arrival: match[2],
    departure: match[1],
  };
}

function routeEndpointFingerprint(value: string | null | undefined) {
  const airportCode = value?.match(/\b[A-Z]{3}\b/)?.[0];

  return airportCode ?? normalizeText(value);
}

function routeForRecord(record: DraftObject) {
  const departure = getStringFromKeys(record, [
    "departure",
    "departureLocation",
    "from",
  ]);
  const arrival = getStringFromKeys(record, ["arrival", "arrivalLocation", "to"]);
  const textRoute = extractIataRoute(
    textFor(record, [
      "title",
      "description",
      "departure",
      "arrival",
      "provider",
      "confirmation",
      "flightNumber",
      "trainNumber",
    ])
  );

  if (departure && arrival) {
    return {
      arrival: routeEndpointFingerprint(arrival),
      departure: routeEndpointFingerprint(departure),
    };
  }

  if (textRoute) {
    return {
      arrival: routeEndpointFingerprint(textRoute.arrival),
      departure: routeEndpointFingerprint(textRoute.departure),
    };
  }

  return null;
}

function extractTransportNumbers(record: DraftObject) {
  const rawText = textFor(record, [
    "title",
    "description",
    "provider",
    "confirmation",
    "flightNumber",
    "trainNumber",
  ]);
  const numbers = [
    getString(record, "flightNumber"),
    getString(record, "trainNumber"),
  ].filter(Boolean) as string[];

  for (const match of rawText.matchAll(
    /\b(?:flight|flt|train|rail|rj|ic|ec)\s*([A-Z0-9]{0,3}\s?\d{2,4})\b/gi
  )) {
    if (match[1]) {
      numbers.push(match[1]);
    }
  }

  for (const match of rawText.matchAll(/\b([A-Z][A-Z0-9]\s?\d{2,4})\b/g)) {
    if (match[1]) {
      numbers.push(match[1]);
    }
  }

  return Array.from(
    new Set(
      numbers
        .map((value) => normalizeText(value).replace(/\s+/g, ""))
        .filter(Boolean)
    )
  );
}

function hasConflictingTransportIdentity(
  activity: DraftObject,
  transport: DraftObject
) {
  const activityRoute = routeForRecord(activity);
  const transportRoute = routeForRecord(transport);

  if (
    activityRoute &&
    transportRoute &&
    (activityRoute.departure !== transportRoute.departure ||
      activityRoute.arrival !== transportRoute.arrival)
  ) {
    return true;
  }

  const activityNumbers = extractTransportNumbers(activity);
  const transportNumbers = extractTransportNumbers(transport);

  return Boolean(
    activityNumbers.length &&
      transportNumbers.length &&
      !activityNumbers.some((number) => transportNumbers.includes(number))
  );
}

function inferPromotedTravelActivityKind(
  activity: DraftObject
): TravelBoundaryTransportType | null {
  const boundary = travelBoundaryRecordForDraft(activity);
  const policyKind = inferTravelBoundaryTransportKind(boundary);
  const rawText = textFor(activity, [
    "title",
    "description",
    "departure",
    "arrival",
    "provider",
    "confirmation",
    "flightNumber",
    "trainNumber",
  ]);
  const text = normalizeText(rawText);

  if (policyKind) {
    return policyKind;
  }

  if (
    getString(activity, "trainNumber") ||
    /\b(train|rail|railjet|regiojet|intercity train|bahnhof|hbf|hl n)\b/.test(
      text
    )
  ) {
    return "train";
  }

  if (
    getString(activity, "flightNumber") ||
    extractIataRoute(rawText) ||
    /\b[A-Z0-9]{2}\s?\d{2,4}\b/.test(rawText)
  ) {
    return "flight";
  }

  return null;
}

function hasStrongTravelPromotionSignal(activity: DraftObject) {
  const rawText = textFor(activity, [
    "title",
    "description",
    "departure",
    "arrival",
    "provider",
    "confirmation",
    "flightNumber",
    "trainNumber",
  ]);
  const text = normalizeText(rawText);

  return Boolean(
    (getString(activity, "departure") && getString(activity, "arrival")) ||
      getString(activity, "provider") ||
      getStringFromKeys(activity, [
        "confirmation",
        "reservation",
        "bookingNumber",
        "orderNumber",
      ]) ||
      getStringFromKeys(activity, ["flightNumber", "trainNumber"]) ||
      extractIataRoute(rawText) ||
      /\b(flight|fly|airline|boarding|terminal)\b/.test(text) ||
      /\b(train to|train from|rail to|rail from|train code|intercity train|railjet|regiojet|bahnhof|hbf|hl n)\b/.test(
        text
      ) ||
      /\b(bus to|bus from|coach to|coach from|ferry to|ferry from)\b/.test(text)
  );
}

function isPromotableTravelActivity(activity: DraftObject) {
  if (!dateFor(activity)) {
    return false;
  }

  const kind = inferPromotedTravelActivityKind(activity);

  if (!kind || kind === "other" || kind === "rental_car") {
    return false;
  }

  const boundary = {
    ...travelBoundaryRecordForDraft(activity),
    transportType: kind,
  };

  return (
    hasArrivalDepartureCategory(activity) &&
    hasStrongTravelPromotionSignal(activity) &&
    shouldBeTravelRow(boundary)
  );
}

function createTransportFromTravelActivity(activity: DraftObject) {
  const rawText = textFor(activity, [
    "title",
    "description",
    "departure",
    "arrival",
    "provider",
    "confirmation",
    "flightNumber",
    "trainNumber",
  ]);
  const iataRoute = extractIataRoute(rawText);
  const times = extractClockTimes(rawText);
  const kind = inferPromotedTravelActivityKind(activity) ?? "other";
  const transport: DraftObject = {
    arrival: getStringFromKeys(activity, ["arrival", "arrivalLocation", "to"]) ??
      iataRoute?.arrival,
    arrivalTime: firstKnownTime(activity, ["arrivalTime", "endTime"]) ?? times[1],
    confirmation: getStringFromKeys(activity, [
      "confirmation",
      "reservation",
      "bookingNumber",
      "orderNumber",
    ]),
    date: dateFor(activity),
    departure:
      getStringFromKeys(activity, ["departure", "departureLocation", "from"]) ??
      iataRoute?.departure,
    departureTime:
      firstKnownTime(activity, ["departureTime", "startTime", "time"]) ?? times[0],
    description: getString(activity, "description"),
    provider: getString(activity, "provider"),
    title: getString(activity, "title") ?? "Transport",
    type: kind,
  };
  const flightNumber = getString(activity, "flightNumber");
  const trainNumber = getString(activity, "trainNumber");

  if (flightNumber) {
    transport.flightNumber = flightNumber;
  }

  if (trainNumber) {
    transport.trainNumber = trainNumber;
  }

  return transport;
}

function promoteTravelActivitiesToTransport({
  activities,
  debug,
  transports,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  transports: DraftObject[];
}) {
  const retainedActivities: DraftObject[] = [];
  const nextTransports = [...transports];

  for (const activity of activities) {
    if (!isPromotableTravelActivity(activity)) {
      retainedActivities.push(activity);
      continue;
    }

    const duplicate = findDuplicateTransport(activity, nextTransports);

    if (duplicate) {
      retainedActivities.push(activity);
      continue;
    }

    const transport = createTransportFromTravelActivity(activity);

    nextTransports.push(transport);
    debug.promotedTravelActivities.push({
      date: dateFor(activity),
      promotedTitle: getString(activity, "title") ?? "Untitled activity",
      transportTitle: getString(transport, "title") ?? "Transport",
    });
  }

  promoteTransportExtractedDetails(nextTransports);

  return {
    activities: retainedActivities,
    transports: nextTransports,
  };
}

function transportMatchScore(activity: DraftObject, transport: DraftObject) {
  const activityText = normalizeText(
    textFor(activity, ["title", "description", "departure", "arrival"])
  );
  const transportTexts = [
    getString(transport, "title"),
    getString(transport, "departure"),
    getString(transport, "arrival"),
    getString(transport, "provider"),
    getString(transport, "confirmation"),
    getString(transport, "flightNumber"),
    getString(transport, "trainNumber"),
    getString(transport, "description"),
  ];
  let score = 0;

  for (const value of transportTexts) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    if (activityText.includes(normalized)) {
      score += normalized.length > 8 ? 3 : 2;
      continue;
    }

    const words = normalizeWords(normalized);
    const matches = words.filter((word) => activityText.includes(word));

    if (matches.length >= 2) {
      score += 2;
    } else if (matches.length === 1 && matches[0].length >= 4) {
      score += 1;
    }
  }

  const transportType = normalizeText(getString(transport, "type"));

  if (transportType && activityText.includes(transportType)) {
    score += 2;
  }

  return score;
}

function findDuplicateTransport(
  activity: DraftObject,
  transports: DraftObject[]
) {
  const date = dateFor(activity);
  const activityText = textFor(activity);

  if (!date || !activityText || !isTransportActionText(activityText)) {
    return null;
  }

  const sameDayTransports = transports.filter(
    (transport) =>
      dateFor(transport) === date &&
      !hasConflictingTransportIdentity(activity, transport)
  );
  const activityTitle = normalizeText(getString(activity, "title"));
  const exactTitleMatch = sameDayTransports.find((transport) => {
    const transportTitle = normalizeText(getString(transport, "title"));
    return Boolean(activityTitle && transportTitle && activityTitle === transportTitle);
  });

  if (exactTitleMatch) {
    return exactTitleMatch;
  }

  const rentalCarMatch = sameDayTransports.find(
    (transport) =>
      normalizeText(getString(transport, "type")) === "rental car" &&
      isRentalCarText(activityText)
  );

  if (rentalCarMatch) {
    return rentalCarMatch;
  }

  const scored = sameDayTransports
    .map((transport) => ({
      score: transportMatchScore(activity, transport),
      transport,
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (!best || best.score < 2) {
    return null;
  }

  if (
    isSeparateLocalMovement(activityText) &&
    best.score < 4 &&
    normalizeText(getString(best.transport, "type")) !== "rental car"
  ) {
    return null;
  }

  return best.transport;
}

function appendUniqueSentence(existing: string | null, addition: string | null) {
  if (!addition) {
    return existing ?? null;
  }

  if (!existing) {
    return addition;
  }

  const normalizedExisting = normalizeText(existing);
  const normalizedAddition = normalizeText(addition);

  if (
    normalizedExisting.includes(normalizedAddition) ||
    normalizedAddition.includes(normalizedExisting)
  ) {
    return existing;
  }

  return `${existing} ${addition}`;
}

function mergeTransportActivityDetails(
  transport: DraftObject,
  activity: DraftObject
) {
  const activityText = textFor(activity, [
    "title",
    "description",
    "departure",
    "arrival",
    "address",
    "locationName",
  ]);
  const activityTimes = extractClockTimes(activityText);
  const activityTime = firstKnownTime(activity, ["startTime", "time", "departureTime"]) ?? activityTimes[0];
  const activityEndTime =
    firstKnownTime(activity, ["endTime", "arrivalTime"]) ?? activityTimes[1];
  const activityLocation = getStringFromKeys(activity, [
    "locationName",
    "address",
    "departure",
  ]);
  const activityDescription = textFor(activity, ["description"]);
  const transportType = normalizeText(getString(transport, "type"));
  const strictTravelDescription = /\b(flight|train)\b/.test(transportType);
  const unrelatedTravelDetail =
    /\b(hostel|hotel|airbnb|apartment|buzzer|door code|lockbox|restaurant|dinner|lunch|museum|palace|shopping|sightseeing|walk to the stay|directions? to (?:the )?(?:hostel|hotel|apartment|airbnb))\b/.test(
      normalizeText(activityDescription)
    );
  const safeActivityDescription =
    strictTravelDescription && unrelatedTravelDetail
      ? null
      : activityDescription;

  if (!getString(transport, "departureTime") && activityTime) {
    transport.departureTime = activityTime;
  }

  if (!getString(transport, "arrivalTime") && activityEndTime) {
    transport.arrivalTime = activityEndTime;
  }

  if (
    activityLocation &&
    !getString(transport, "departure") &&
    /\b(rental car|transfer|drive|bus|ferry|other)\b/.test(transportType)
  ) {
    transport.departure = activityLocation;
  }

  const detailParts = [
    safeActivityDescription,
    !strictTravelDescription && getString(activity, "address")
      ? `Address: ${getString(activity, "address")}.`
      : null,
    !strictTravelDescription && getStringFromKeys(activity, ["phone", "contactPhone", "providerPhone"])
      ? `Phone: ${getStringFromKeys(activity, ["phone", "contactPhone", "providerPhone"])}.`
      : null,
    getStringFromKeys(activity, ["reservation", "bookingNumber", "orderNumber", "confirmation"])
      ? `Confirmation: ${getStringFromKeys(activity, ["reservation", "bookingNumber", "orderNumber", "confirmation"])}.`
      : null,
    !strictTravelDescription && getString(activity, "openingHours")
      ? `Hours: ${getString(activity, "openingHours")}.`
      : null,
  ]
    .filter(Boolean);
  let description = getString(transport, "description");

  for (const detail of detailParts) {
    description = appendUniqueSentence(description, detail);
  }

  transport.description = description;
}

function promoteTransportExtractedDetails(transports: DraftObject[]) {
  for (const transport of transports) {
    normalizeRentalCarTitle(transport);

    const text = textFor(transport, [
      "title",
      "description",
      "departure",
      "arrival",
      "provider",
      "confirmation",
    ]);
    const times = extractClockTimes(text);

    if (!getString(transport, "departureTime") && times[0]) {
      transport.departureTime = times[0];
    }

    if (!getString(transport, "arrivalTime") && times[1]) {
      transport.arrivalTime = times[1];
    }
  }
}

function mergeRentalCarDetailsIntoActivity(
  activity: DraftObject,
  source: DraftObject
) {
  const departureTime = firstKnownTime(source, [
    "departureTime",
    "startTime",
    "time",
  ]);
  const arrivalTime = firstKnownTime(source, ["arrivalTime", "endTime"]);
  const pickup = getString(source, "departure") ?? getString(source, "address");
  const dropoff = getString(source, "arrival");
  const provider = getString(source, "provider");
  const confirmation = getStringFromKeys(source, [
    "confirmation",
    "reservation",
    "bookingNumber",
    "orderNumber",
  ]);
  let description = getString(activity, "description");
  const detailParts = [
    getString(source, "description"),
    pickup ? `Pickup: ${pickup}.` : null,
    dropoff ? `Drop-off: ${dropoff}.` : null,
    provider ? `Provider: ${provider}.` : null,
    confirmation ? `Confirmation: ${confirmation}.` : null,
  ].filter(Boolean);

  activity.title = normalizedRentalCarPickupTitle(activity);
  activity.category = getString(activity, "category") ?? "arrival_departure";
  activity.itemType = "activity";

  if (!getString(activity, "date") && getString(source, "date")) {
    activity.date = getString(source, "date");
  }

  if (!getString(activity, "startTime") && departureTime) {
    activity.startTime = departureTime;
  }

  if (!getString(activity, "endTime") && arrivalTime) {
    activity.endTime = arrivalTime;
  }

  if (!getString(activity, "address") && pickup) {
    activity.address = pickup;
  }

  for (const detail of detailParts) {
    description = appendUniqueSentence(description, detail);
  }

  activity.description = description;
}

function createRentalCarActivityFromTransport(transport: DraftObject) {
  const activity: DraftObject = {
    category: "arrival_departure",
    date: getString(transport, "date"),
    itemType: "activity",
    title: normalizedRentalCarPickupTitle(transport),
  };

  mergeRentalCarDetailsIntoActivity(activity, transport);

  return activity;
}

function findRentalCarActivityIndex(
  activities: DraftObject[],
  transport: DraftObject
) {
  const date = dateFor(transport);
  const transportTitle = normalizeText(getString(transport, "title"));

  return activities.findIndex((activity) => {
    if (!isRentalCarText(textFor(activity, ["title", "description"]))) {
      return false;
    }

    if (date && dateFor(activity) && dateFor(activity) !== date) {
      return false;
    }

    const activityTitle = normalizeText(getString(activity, "title"));

    return (
      !transportTitle ||
      !activityTitle ||
      transportTitle === activityTitle ||
      activityTitle.includes("car") ||
      transportTitle.includes("car")
    );
  });
}

function rentalCarActivityKey(activity: DraftObject) {
  if (!isRentalCarText(textFor(activity, ["title", "description"]))) {
    return null;
  }

  return `${dateFor(activity) ?? "undated"}|${normalizeText(
    normalizedRentalCarPickupTitle(activity)
  )}`;
}

function normalizeRentalCarPickups({
  activities,
  debug,
  transports,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  transports: DraftObject[];
}) {
  const nextActivities = [...activities];
  const nextTransports: DraftObject[] = [];

  for (const transport of transports) {
    if (!isRentalCarTransport(transport)) {
      nextTransports.push(transport);
      continue;
    }

    const matchIndex = findRentalCarActivityIndex(nextActivities, transport);
    const activity =
      matchIndex >= 0 && nextActivities[matchIndex]
        ? nextActivities[matchIndex]
        : createRentalCarActivityFromTransport(transport);

    if (matchIndex >= 0) {
      mergeRentalCarDetailsIntoActivity(activity, transport);
    } else {
      nextActivities.push(activity);
    }

    debug.normalizedRentalCarPickups.push({
      date: dateFor(activity),
      title: getString(activity, "title") ?? "Pick up rental car",
    });
  }

  const retainedActivities: DraftObject[] = [];
  const seenRentalPickups = new Map<string, DraftObject>();

  for (const activity of nextActivities) {
    const key = rentalCarActivityKey(activity);

    if (!key) {
      retainedActivities.push(activity);
      continue;
    }

    const existing = seenRentalPickups.get(key);

    if (!existing) {
      activity.title = normalizedRentalCarPickupTitle(activity);
      retainedActivities.push(activity);
      seenRentalPickups.set(key, activity);
      continue;
    }

    mergeRentalCarDetailsIntoActivity(existing, activity);
    debug.normalizedRentalCarPickups.push({
      date: dateFor(existing),
      title: getString(existing, "title") ?? "Pick up rental car",
    });
  }

  return {
    activities: retainedActivities,
    transports: nextTransports,
  };
}

function hasStandaloneAnchor(record: DraftObject) {
  return hasStandaloneActivityAnchor(toDraftActivityInput(record));
}

function isBroadParent(record: DraftObject) {
  const title = normalizeText(getString(record, "title"));
  const description = normalizeText(getString(record, "description"));
  const text = `${title} ${description}`.trim();

  if (!title) {
    return false;
  }

  return (
    /\b(day trip|sightseeing day|sightseeing walk|sightseeing route|walking day|history sights|history sites|city sights|old town sights|museum afternoon|museum day|day overview|day summary)\b/.test(
      title
    ) ||
    /\b(sights|sites|places|overview|itinerary|also noted)\b/.test(title) ||
    (description.split(/\s+/).length > 12 &&
      text.split(/\b(?:and|,|;|also noted)\b/).filter((part) => part.trim().length > 3)
        .length >= 4)
  );
}

function isCompositeParent(record: DraftObject) {
  const title = normalizeText(getString(record, "title"));
  const description = normalizeText(getString(record, "description"));
  const text = `${title} ${description}`.trim();

  if (!title) {
    return false;
  }

  return (
    /\b(and|plus|with)\b|\/|\+/.test(title) ||
    /\b(morning|afternoon|evening).*\b(and|plus|with)\b/.test(text) ||
    (/\b(walking tour|tour|sightseeing|sights|places)\b/.test(title) &&
      /\b(and|then|after|also)\b/.test(description))
  );
}

function isSameSiteGroup(record: DraftObject) {
  return isSameSiteActivityGroup(toDraftActivityInput(record));
}

function isTourGroup(record: DraftObject) {
  return isTourActivityGroup(toDraftActivityInput(record));
}

function isPlannedAreaGroup(record: DraftObject) {
  return isPlannedAreaActivityGroup(toDraftActivityInput(record));
}

function isGenericTourTitle(record: DraftObject) {
  const title = normalizeText(getString(record, "title"));

  return /\b(walking tour|city walking tour|prague walking tour|rome walking tour|vienna walking tour|tour)\b/.test(
    title
  );
}

function isNoteLikeRecord(record: DraftObject) {
  return getString(record, "itemType") === "note" || isLooseTipActivity(record);
}

function recordMentionsTitle(record: DraftObject, title: string | null) {
  const text = normalizeText(textFor(record));
  const normalizedTitle = normalizeText(title);

  if (!text || !normalizedTitle) {
    return false;
  }

  if (text.includes(normalizedTitle)) {
    return true;
  }

  const titleWords = normalizeWords(normalizedTitle);

  if (titleWords.length === 0) {
    return false;
  }

  const matched = titleWords.filter((word) => text.includes(word));
  const requiredMatches = titleWords.length <= 2 ? titleWords.length : 2;

  return matched.length >= requiredMatches;
}

function childIsContainedInParent(parent: DraftObject, child: DraftObject) {
  const childTitle = getString(child, "title");

  if (!childTitle) {
    return false;
  }

  if (!recordMentionsTitle(parent, childTitle)) {
    return false;
  }

  return normalizeText(getString(parent, "title")) !== normalizeText(childTitle);
}

function childBelongsUnderParent(parent: DraftObject, child: DraftObject) {
  if (childIsContainedInParent(parent, child)) {
    return true;
  }

  if (isPlannedAreaGroup(parent)) {
    return !hasStandaloneAnchor(child) && recordMentionsTitle(parent, getString(child, "title"));
  }

  if (!isSameSiteGroup(parent)) {
    return false;
  }

  const parentWords = normalizeWords(textFor(parent));
  const childWords = normalizeWords(textFor(child));
  const sharedWords = childWords.filter((word) => parentWords.includes(word));

  return sharedWords.some(
    (word) =>
      word.length >= 5 &&
      ![
        "breakfast",
        "coffee",
        "dinner",
        "lunch",
        "restaurant",
        "nearby",
        "prague",
        "vienna",
        "budapest",
        "rome",
        "paris",
      ].includes(word)
  );
}

function improvesGenericTourTitle(record: DraftObject) {
  const title = getString(record, "title");
  const description = getString(record, "description");
  const normalizedTitle = normalizeText(title);

  if (
    !title ||
    !description ||
    !/\b(walking tour|walk|tour)\b/.test(normalizedTitle) ||
    !/\b(generic|walking tour|city walking tour|prague walking tour|rome walking tour|vienna walking tour)\b/.test(
      normalizedTitle
    )
  ) {
    return record;
  }

  const quotedTitle =
    description.match(/['"“”]([^'"“”]{8,90})['"“”]/)?.[1]?.trim() ?? null;

  if (!quotedTitle || /\b(am|pm|paid|paypal|booking|confirmation)\b/i.test(quotedTitle)) {
    return record;
  }

  return {
    ...record,
    title: quotedTitle,
  };
}

function mergeGroupedChildDetails(parent: DraftObject, child: DraftObject) {
  const childTitle = getString(child, "title");
  const childTime = firstKnownTime(child, ["startTime", "time", "departureTime"]);
  const childEndTime = firstKnownTime(child, ["endTime", "arrivalTime"]);
  const childDescription = getString(child, "description");
  const childLabel = [
    childTitle,
    [childTime, childEndTime].filter(Boolean).join("-"),
  ]
    .filter(Boolean)
    .join(" · ");

  if (childLabel) {
    parent.description = appendIncludedStop(
      getString(parent, "description"),
      [childLabel, childDescription].filter(Boolean).join(" - ")
    );
  }

  const parentTime = firstKnownTime(parent, ["startTime", "time", "departureTime"]);

  if (
    childTime &&
    (!parentTime || (timeToMinutes(childTime) ?? Infinity) < (timeToMinutes(parentTime) ?? Infinity))
  ) {
    parent.startTime = childTime;
  }
}

function appendIncludedStop(existing: string | null, stop: string | null) {
  if (!stop) {
    return existing ?? null;
  }

  const cleanedStop = stop.replace(/\s+/g, " ").replace(/[.]\s*$/, "").trim();

  if (!cleanedStop) {
    return existing ?? null;
  }

  const normalizedStop = normalizeText(cleanedStop);
  const normalizedExisting = normalizeText(existing);

  if (normalizedExisting.includes(normalizedStop)) {
    return existing ?? null;
  }

  if (!existing) {
    return `Includes:\n- ${cleanedStop}`;
  }

  if (/includes:\s*(?:\n|$)/i.test(existing)) {
    return `${existing.trim()}\n- ${cleanedStop}`;
  }

  return `${existing.trim()}\nIncludes:\n- ${cleanedStop}`;
}

function suppressTransportDuplicates({
  activities,
  debug,
  transports,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  transports: DraftObject[];
}) {
  return activities.filter((activity) => {
    const duplicate = findDuplicateTransport(activity, transports);

    if (!duplicate) {
      return true;
    }

    mergeTransportActivityDetails(duplicate, activity);
    debug.suppressedTransportActivities.push({
      date: dateFor(activity),
      matchedTransportTitle:
        getString(duplicate, "title") ??
        ([getString(duplicate, "departure"), getString(duplicate, "arrival")]
          .filter(Boolean)
          .join(" to ") || "Transport"),
      removedTitle: getString(activity, "title") ?? "Untitled activity",
    });

    return false;
  });
}

function stayContainsDate(stay: DraftObject, date: string | null) {
  const parsedDate = parseDate(date);
  const checkIn = parseDate(
    getString(stay, "checkIn") ??
      getString(stay, "checkInDate") ??
      getString(stay, "firstNightDate")
  );
  const checkOut = parseDate(getString(stay, "checkOut") ?? getString(stay, "checkOutDate"));

  if (!parsedDate || !checkIn) {
    return false;
  }

  if (!checkOut) {
    return parsedDate.getTime() === checkIn.getTime();
  }

  return parsedDate >= checkIn && parsedDate <= checkOut;
}

function isSeparateBagStorage(value: string) {
  const text = normalizeText(value);

  return /\b(luggage storage|left luggage|bag storage|locker|lockers|station|airport|storage facility|store bags at)\b/.test(
    text
  );
}

function activityExplicitlyNamesStay(activityText: string, stay: DraftObject) {
  const stayName = normalizeText(getString(stay, "name"));
  const stayTitle = normalizeText(getString(stay, "title"));

  return Boolean(
    (stayName && normalizeText(activityText).includes(stayName)) ||
      (stayTitle && normalizeText(activityText).includes(stayTitle))
  );
}

function isSeparateStayMovement(activity: DraftObject, stay: DraftObject) {
  const activityText = textFor(activity);
  const normalizedText = normalizeText(activityText);

  if (isSeparateBagStorage(activityText) && !activityExplicitlyNamesStay(activityText, stay)) {
    return true;
  }

  const activityMinutes = timeToMinutes(timeFor(activity));
  const stayCheckInMinutes = timeToMinutes(getString(stay, "checkInTime"));
  const looksLikeBagDrop = /\b(drop bags?|bag drop|left bags?|store bags?)\b/.test(
    normalizedText
  );

  if (
    looksLikeBagDrop &&
    activityMinutes !== null &&
    stayCheckInMinutes !== null &&
    stayCheckInMinutes - activityMinutes >= 120
  ) {
    return true;
  }

  if (looksLikeBagDrop && activityMinutes !== null && stayCheckInMinutes === null) {
    return activityMinutes < 12 * 60;
  }

  return false;
}

function isStayFlowText(value: string) {
  return /\b(check in|check-in|checkin|drop bags?|bag drop|arrive|arrival|stay|staying|lodging|hotel|hostel|airbnb|apartment)\b/.test(
    normalizeText(value)
  );
}

function stayMatchScore(activity: DraftObject, stay: DraftObject) {
  const activityText = normalizeText(textFor(activity));
  const stayNames = [
    getString(stay, "name"),
    getString(stay, "title"),
    getString(stay, "publicLocationLabel"),
    getString(stay, "address"),
  ];
  let score = 0;

  for (const value of stayNames) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    if (activityText.includes(normalized)) {
      score += normalized.length > 8 ? 4 : 3;
      continue;
    }

    const words = normalizeWords(normalized);
    const matches = words.filter((word) => activityText.includes(word));

    if (matches.length >= Math.min(2, words.length)) {
      score += 2;
    }
  }

  if (/\b(hostel|hotel|airbnb|apartment|lodging)\b/.test(activityText)) {
    score += 1;
  }

  if (/\b(check in|check-in|checkin|drop bags?|bag drop|arrival)\b/.test(activityText)) {
    score += 1;
  }

  return score;
}

function findDuplicateStay(activity: DraftObject, stays: DraftObject[]) {
  const date = dateFor(activity);
  const activityText = textFor(activity);

  if (!date || !activityText || !isStayFlowText(activityText)) {
    return null;
  }

  if (isSeparateBagStorage(activityText)) {
    const explicitlyNamesStay = stays.some((stay) => {
      const stayName = normalizeText(getString(stay, "name"));
      return Boolean(stayName && normalizeText(activityText).includes(stayName));
    });

    if (!explicitlyNamesStay) {
      return null;
    }
  }

  const sameDayStays = stays.filter((stay) => stayContainsDate(stay, date));
  const scored = sameDayStays
    .map((stay) => ({ score: stayMatchScore(activity, stay), stay }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best) {
    return null;
  }

  if (isSeparateStayMovement(activity, best.stay)) {
    return null;
  }

  if (best.score >= 2) {
    return best.stay;
  }

  if (
    best.score >= 1 &&
    sameDayStays.length === 1 &&
    /\b(check in|check-in|checkin|drop bags?|bag drop|arrival|arrive|hotel|hostel|airbnb|apartment)\b/.test(
      normalizeText(activityText)
    )
  ) {
    return best.stay;
  }

  return null;
}

function mergeStayActivityDetails(stay: DraftObject, activity: DraftObject) {
  const activityTime = timeFor(activity);
  const activityDate = dateFor(activity);

  if (
    activityTime &&
    !getString(stay, "checkInTime") &&
    /\b(check in|check-in|checkin|arrival)\b/.test(normalizeText(textFor(activity)))
  ) {
    stay.checkInTime = activityTime;
  }

  if (
    activityDate &&
    !getString(stay, "checkIn") &&
    !getString(stay, "checkInDate")
  ) {
    stay.checkIn = activityDate;
  }
}

function suppressStayFlowActivities({
  activities,
  debug,
  stays,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  stays: DraftObject[];
}) {
  return activities.filter((activity) => {
    const duplicate = findDuplicateStay(activity, stays);

    if (!duplicate) {
      return true;
    }

    mergeStayActivityDetails(duplicate, activity);
    debug.foldedLodgingNotes.push({
      stayTitle: getString(duplicate, "name") ?? null,
      title: getString(activity, "title") ?? "Lodging flow",
    });

    return false;
  });
}

function isDayOverviewActivity(activity: DraftObject) {
  return classifyDraftActivity(activity).isOverviewActivity;
}

function groupingKindForParent(parent: DraftObject): GroupingKind {
  return getDraftActivityGroupingKind(toDraftActivityInput(parent));
}

function suppressDayOverviewActivities({
  activities,
  debug,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
}) {
  return activities.filter((activity) => {
    if (!isDayOverviewActivity(activity)) {
      return true;
    }

    debug.suppressedDayOverviews.push({
      date: dateFor(activity),
      removedTitle: getString(activity, "title") ?? "Day overview",
    });

    return false;
  });
}

function pruneParentChildActivities({
  activities,
  debug,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
}) {
  const removedIndexes = new Set<number>();

  activities.forEach((parent, parentIndex) => {
    if (removedIndexes.has(parentIndex)) {
      return;
    }

    if (isNoteLikeRecord(parent)) {
      return;
    }

    const sameDayChildren = activities
      .map((child, childIndex) => ({ child, childIndex }))
      .filter(
        ({ child, childIndex }) =>
          childIndex !== parentIndex &&
          !removedIndexes.has(childIndex) &&
          !isNoteLikeRecord(child) &&
          dateFor(child) === dateFor(parent) &&
          childBelongsUnderParent(parent, child)
      );
    const sameTimeTourDuplicates = activities
      .map((child, childIndex) => ({ child, childIndex }))
      .filter(
        ({ child, childIndex }) =>
          childIndex !== parentIndex &&
          !removedIndexes.has(childIndex) &&
          !isNoteLikeRecord(child) &&
          dateFor(child) === dateFor(parent) &&
          timeFor(child) &&
          timeFor(child) === timeFor(parent) &&
          isGenericTourTitle(parent) &&
          isTourGroup(child)
      );
    const candidateChildren = [...sameDayChildren];

    for (const duplicate of sameTimeTourDuplicates) {
      if (
        !candidateChildren.some(
          (candidate) => candidate.childIndex === duplicate.childIndex
        )
      ) {
        candidateChildren.push(duplicate);
      }
    }

    if (candidateChildren.length === 0) {
      return;
    }

    const standaloneChildren = candidateChildren.filter(({ child }) =>
      hasStandaloneAnchor(child)
    );

    if (
      (isBroadParent(parent) || isCompositeParent(parent)) &&
      !isSameSiteGroup(parent) &&
      !isPlannedAreaGroup(parent) &&
      (candidateChildren.length >= 2 ||
        (isCompositeParent(parent) && standaloneChildren.length > 0) ||
        standaloneChildren.length > 0)
    ) {
      removedIndexes.add(parentIndex);
      debug.removedDuplicateParents.push({
        date: dateFor(parent),
        reason: standaloneChildren.length
          ? "A named/timed child card covered the broad parent."
          : "Named child cards covered the broad parent.",
        removedTitle: getString(parent, "title") ?? "Untitled activity",
        survivingTitles: candidateChildren.map(
          ({ child }) => getString(child, "title") ?? "Untitled activity"
        ),
      });
      return;
    }

    if (!isTourGroup(parent) && !isSameSiteGroup(parent) && !isPlannedAreaGroup(parent)) {
      return;
    }

    for (const { child, childIndex } of sameDayChildren) {
      const keepStandaloneChild = hasStandaloneAnchor(child) && !isSameSiteGroup(parent);

      if (keepStandaloneChild) {
        continue;
      }

      mergeGroupedChildDetails(parent, child);
      removedIndexes.add(childIndex);
      debug.removedGroupedChildren.push({
        date: dateFor(child),
        groupingKind: groupingKindForParent(parent),
        groupedUnder: getString(parent, "title") ?? "Grouped activity",
        removedTitle: getString(child, "title") ?? "Untitled activity",
      });
    }
  });

  return activities.filter((_activity, index) => !removedIndexes.has(index));
}

function isLodgingNoteActivity(activity: DraftObject, stays: DraftObject[]) {
  const text = normalizeText(textFor(activity));

  if (!text || timeFor(activity)) {
    return false;
  }

  if (/\b(check in|check-in|drop bags?|bag drop|arrive|arrival)\b/.test(text)) {
    return false;
  }

  if (
    !/\b(stay|lodging|hotel|hostel|airbnb|apartment|private room|shared bathroom|bathroom|amount due|payment due|pay at arrival|check in|check out|budget|total|cost|price|paid)\b/.test(
      text
    )
  ) {
    return false;
  }

  return stays.some((stay) => {
    const stayName = normalizeText(getString(stay, "name"));
    return Boolean(stayName && text.includes(stayName));
  }) || /\b(private room|shared bathroom|amount due|payment due|pay at arrival|lodging note|hotel budget|lodging budget|total cost|price|paid)\b/.test(text);
}

function isWeakDatedCityNoteCandidate(activity: DraftObject) {
  return classifyDraftActivity(activity).isWeakDatedCityNoteCandidate;
}

function isFirmDayActivity(activity: DraftObject) {
  return (
    !isNoteLikeRecord(activity) &&
    !isWeakDatedCityNoteCandidate(activity) &&
    !isDayOverviewActivity(activity)
  );
}

function weakDatedCandidatesForDate(
  activities: DraftObject[],
  date: string | null
) {
  if (!date) {
    return [];
  }

  return activities.filter(
    (candidate) =>
      candidate !== null &&
      dateFor(candidate) === date &&
      !isLooseTipActivity(candidate) &&
      isWeakDatedCityNoteCandidate(candidate)
  );
}

function firmActivitiesForDate(activities: DraftObject[], date: string | null) {
  if (!date) {
    return [];
  }

  return activities.filter(
    (candidate) => dateFor(candidate) === date && isFirmDayActivity(candidate)
  );
}

function isOpenDayOptionCandidate(activity: DraftObject) {
  const classification = classifyDraftActivity(activity);

  if (
    !dateFor(activity) ||
    timeFor(activity) ||
    getString(activity, "endTime") ||
    hasStandaloneAnchor(activity) ||
    isPlannedAreaGroup(activity) ||
    isSameSiteGroup(activity) ||
    isTourGroup(activity) ||
    classification.isLooseTipActivity ||
    classification.hasStrongPlannedActivityLanguage ||
    isRentalCarText(textFor(activity)) ||
    isTransportActionText(textFor(activity))
  ) {
    return false;
  }

  return (
    classification.isWeakDatedCityNoteCandidate ||
    classification.isSightOrLoosePlace
  );
}

function firmActivitiesForOpenDayGrouping(
  activities: DraftObject[],
  date: string | null
) {
  return firmActivitiesForDate(activities, date).filter(
    (activity) => !isOpenDayOptionCandidate(activity)
  );
}

function shouldRetainWeakDatedCandidate(
  activity: DraftObject,
  activities: DraftObject[]
) {
  const date = dateFor(activity);
  const sameDateWeakCandidates = weakDatedCandidatesForDate(activities, date);
  const weakIndex = sameDateWeakCandidates.indexOf(activity);
  const firmCount = firmActivitiesForDate(activities, date).length;

  if (weakIndex < 0) {
    return false;
  }

  if (firmCount >= 3) {
    return false;
  }

  if (firmCount === 0) {
    return weakIndex < 5;
  }

  return weakIndex < 4;
}

function hasPotentialGroupingParent(
  activity: DraftObject,
  activities: DraftObject[]
) {
  return activities.some(
    (parent) =>
      parent !== activity &&
      dateFor(parent) === dateFor(activity) &&
      (isPlannedAreaGroup(parent) || isSameSiteGroup(parent) || isTourGroup(parent)) &&
      childBelongsUnderParent(parent, activity)
  );
}

function shouldMoveToCityNotes(
  activity: DraftObject,
  activities: DraftObject[]
) {
  if (isLooseTipActivity(activity)) {
    return true;
  }

  if (hasPotentialGroupingParent(activity, activities)) {
    return false;
  }

  if (!isWeakDatedCityNoteCandidate(activity)) {
    return false;
  }

  return !shouldRetainWeakDatedCandidate(activity, activities);
}

function isLooseTipActivity(activity: DraftObject) {
  return classifyDraftActivity(activity).isLooseTipActivity;
}

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function placeContainsDate(place: DraftObject, date: string | null) {
  const parsedDate = parseDate(date);
  const arrive = parseDate(getString(place, "arriveDate") ?? getString(place, "arrivalDate"));
  const leave = parseDate(getString(place, "leaveDate") ?? getString(place, "departureDate"));

  if (!parsedDate || !arrive) {
    return false;
  }

  if (!leave) {
    return parsedDate.getTime() === arrive.getTime();
  }

  return parsedDate >= arrive && parsedDate < leave;
}

function cityForPlace(place: DraftObject) {
  return getString(place, "city") ?? getString(place, "displayName");
}

function findCityOverridePlace(activity: DraftObject, places: DraftObject[]) {
  const overrideCity = normalizeText(
    getString(activity, "_cityOverride") ??
      getString(activity, "city") ??
      getString(activity, "locationName")
  );

  if (!overrideCity) {
    return null;
  }

  return (
    places.find(
      (place) => normalizeText(cityForPlace(place)) === overrideCity
    ) ?? null
  );
}

function findDatePlace(activity: DraftObject, places: DraftObject[]) {
  return places.find((place) => placeContainsDate(place, dateFor(activity))) ?? null;
}

function findExplicitCityPlace(activity: DraftObject, places: DraftObject[]) {
  const text = normalizeText(textFor(activity));

  return (
    findCityOverridePlace(activity, places) ??
    places.find((place) => {
      const city = normalizeText(cityForPlace(place));
      return Boolean(city && text.includes(city));
    }) ?? null
  );
}

function findCityForActivity(activity: DraftObject, places: DraftObject[]) {
  const text = normalizeText(textFor(activity));
  const overridePlace = findCityOverridePlace(activity, places);

  if (overridePlace) {
    return cityForPlace(overridePlace);
  }

  const directPlace = places.find((place) => {
    const city = normalizeText(cityForPlace(place));
    return Boolean(city && text.includes(city));
  });

  if (directPlace) {
    return cityForPlace(directPlace);
  }

  const datePlace = places.find((place) => placeContainsDate(place, dateFor(activity)));

  if (datePlace) {
    return cityForPlace(datePlace);
  }

  return places.length === 1 ? cityForPlace(places[0]) : null;
}

function stopLineForActivity(activity: DraftObject) {
  const title = getString(activity, "title");
  const description = getString(activity, "description");
  const time = firstKnownTime(activity, ["startTime", "time", "departureTime"]);
  const endTime = firstKnownTime(activity, ["endTime", "arrivalTime"]);
  const timeLabel = [time, endTime].filter(Boolean).join("-");
  const detail =
    description && !normalizeText(description).includes(normalizeText(title))
      ? description
      : null;

  return [title, timeLabel, detail].filter(Boolean).join(" - ");
}

function optionTitlePart(activity: DraftObject) {
  const title = getString(activity, "title") ?? "Option";

  return title
    .replace(/\s+(museum|gallery)$/i, "")
    .replace(/^the\s+/i, "")
    .trim() || title;
}

function joinOptionTitles(parts: string[]) {
  if (parts.length <= 1) {
    return parts[0] ?? "options";
  }

  if (parts.length === 2) {
    return `${parts[0]} or ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}`;
}

function isMuseumOptionCandidate(activity: DraftObject) {
  const text = normalizeText(
    [getString(activity, "title"), getString(activity, "category")].filter(Boolean).join(" ")
  );
  const classification = classifyDraftActivity(activity);

  return (
    !timeFor(activity) &&
    !getString(activity, "endTime") &&
    !hasStandaloneAnchor(activity) &&
    !classification.hasStrongPlannedActivityLanguage &&
    (classification.hasAvailabilityMarker ||
      classification.hasWeakRecommendationMarker) &&
    /\b(museum|gallery)\b/.test(text)
  );
}

function categoryForGroupedChildren(children: DraftObject[]) {
  const categories = children
    .map((child) => getString(child, "category"))
    .filter(Boolean);
  const uniqueCategories = Array.from(new Set(categories));

  if (uniqueCategories.length === 1) {
    return uniqueCategories[0];
  }

  return "admin_logistics";
}

function createOptionActivity({
  children,
  date,
  title,
}: {
  children: DraftObject[];
  date: string | null;
  title: string;
}) {
  return {
    category: categoryForGroupedChildren(children),
    date,
    description: `Possible stops:\n${children
      .map((child) => `- ${stopLineForActivity(child)}`)
      .join("\n")}`,
    endTime: null,
    itemType: "activity",
    startTime: null,
    title,
  };
}

function replaceChildrenWithGroupedActivity({
  activities,
  children,
  debug,
  group,
  groupingKind,
}: {
  activities: DraftObject[];
  children: Array<{ activity: DraftObject; index: number }>;
  debug: TripDraftConsolidationDebug;
  group: DraftObject;
  groupingKind: GroupingKind;
}) {
  const childIndexes = new Set(children.map((child) => child.index));
  const firstIndex = Math.min(...children.map((child) => child.index));

  for (const { activity } of children) {
    debug.removedGroupedChildren.push({
      date: dateFor(activity),
      groupingKind,
      groupedUnder: getString(group, "title") ?? "Grouped activity",
      removedTitle: getString(activity, "title") ?? "Untitled activity",
    });
  }

  return activities.flatMap((activity, index) => {
    if (index === firstIndex) {
      return [group];
    }

    if (childIndexes.has(index)) {
      return [];
    }

    return [activity];
  });
}

function groupMuseumOptionActivities({
  activities,
  debug,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
}) {
  let nextActivities = activities;
  const dates = Array.from(
    new Set(activities.map((activity) => dateFor(activity)).filter(Boolean))
  );

  for (const date of dates) {
    const children = nextActivities
      .map((activity, index) => ({ activity, index }))
      .filter(
        ({ activity }) =>
          dateFor(activity) === date &&
          isMuseumOptionCandidate(activity)
      );

    if (children.length < 2) {
      continue;
    }

    const title = `Museum visit: ${joinOptionTitles(
      children.map(({ activity }) => optionTitlePart(activity))
    )}`;
    const group = createOptionActivity({
      children: children.map(({ activity }) => activity),
      date,
      title,
    });

    nextActivities = replaceChildrenWithGroupedActivity({
      activities: nextActivities,
      children,
      debug,
      group,
      groupingKind: "option_set",
    });
  }

  return nextActivities;
}

function createFreeTimeActivity({
  city,
  date,
}: {
  city: string | null;
  date: string | null;
}) {
  return {
    category: "admin_logistics",
    date,
    description: city
      ? `Flexible time to wander, rest, or add plans in ${city}.`
      : "Flexible time to wander, rest, or add plans.",
    endTime: null,
    itemType: "activity",
    startTime: null,
    title: city ? `Free time in ${city}` : "Free time",
  };
}

function groupOpenDayLooseActivities({
  activities,
  debug,
  places,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  places: DraftObject[];
}) {
  let nextActivities = activities;
  const dates = Array.from(
    new Set(activities.map((activity) => dateFor(activity)).filter(Boolean))
  );

  for (const date of dates) {
    const firmCount = firmActivitiesForOpenDayGrouping(
      nextActivities,
      date
    ).length;
    const children = nextActivities
      .map((activity, index) => ({ activity, index }))
      .filter(
        ({ activity }) =>
          dateFor(activity) === date &&
          isOpenDayOptionCandidate(activity)
      );

    if (firmCount > 0 || children.length === 0) {
      continue;
    }

    const city = findCityForActivity(children[0].activity, places);

    if (children.length === 1) {
      const childIndex = children[0].index;
      nextActivities = nextActivities.flatMap((activity, index) =>
        index === childIndex
          ? [activity, createFreeTimeActivity({ city, date })]
          : [activity]
      );
      continue;
    }

    const group = createOptionActivity({
      children: children.map(({ activity }) => activity),
      date,
      title: city ? `Explore ${city}` : "Explore the area",
    });

    nextActivities = replaceChildrenWithGroupedActivity({
      activities: nextActivities,
      children,
      debug,
      group,
      groupingKind: "open_day_options",
    });
  }

  return nextActivities;
}

function reconcileWrongCityAssignments({
  activities,
  debug,
  places,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  places: DraftObject[];
}) {
  return activities.map((activity) => {
    const assignedPlace = findDatePlace(activity, places);
    const explicitPlace = findExplicitCityPlace(activity, places);
    const assignedCity = assignedPlace ? cityForPlace(assignedPlace) : null;
    const explicitCity = explicitPlace ? cityForPlace(explicitPlace) : null;

    if (
      !assignedCity ||
      !explicitCity ||
      normalizeText(assignedCity) === normalizeText(explicitCity)
    ) {
      return activity;
    }

    const title = getString(activity, "title") ?? "Untitled activity";
    const shouldMoveToCityNotes =
      isLooseTipActivity(activity) || !hasStandaloneAnchor(activity);

    debug.wrongCityPlacements.push({
      action: shouldMoveToCityNotes ? "moved_to_city_notes" : "needs_review",
      assignedCity,
      date: dateFor(activity),
      explicitCity,
      title,
    });

    if (shouldMoveToCityNotes) {
      return {
        ...activity,
        _cityOverride: explicitCity,
        date: null,
        description: appendUniqueSentence(getString(activity, "description"), title),
        itemType: "note",
      };
    }

    return {
      ...activity,
      date: null,
    };
  });
}

function splitNoteText(value: string) {
  const cleaned = value
    .replace(/\b(?:also noted|ideas?|recommendations?|where to eat|food list|restaurant list|shopping ideas|local tips?)\s*:?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(/\n|;|,(?!\s*(?:and|or)\b)|\band also\b|\balso\b/)
    .map((part) => part.trim().replace(/^[.:·\-–—\s]+/, "").trim())
    .filter((part) => part.length > 2);
}

function classifyNoteSection(text: string): NoteSectionName {
  const normalized = normalizeText(text);

  if (
    /\b(bar|pub|beer|wine|cocktail|nightlife|club|music|drink|drinks|cellar)\b/.test(
      normalized
    )
  ) {
    return "Drinks & Nightlife";
  }

  if (
    /\b(restaurant|food|eat|dinner|lunch|breakfast|brunch|cafe|coffee|bakery|pastry|market|tov|bistro|kitchen)\b/.test(
      normalized
    )
  ) {
    return "Food";
  }

  if (/\b(shop|shopping|store|boutique|market|watches|tailor)\b/.test(normalized)) {
    return "Shopping";
  }

  if (
    /\b(museum|palace|church|synagogue|cathedral|park|sight|sights|monument|gallery|tower|castle|house|wheel|prater|natural history|mumok)\b/.test(
      normalized
    )
  ) {
    return "Possible Sights";
  }

  return "Local Notes";
}

function itemOverlapsScheduledActivity(
  entry: string,
  scheduledActivities: Array<{ city: string | null; title: string }>
) {
  const normalizedEntry = normalizeText(entry);

  if (!normalizedEntry) {
    return false;
  }

  return scheduledActivities.some((activity) => {
    const normalizedTitle = normalizeText(activity.title);

    if (!normalizedTitle) {
      return false;
    }

    if (
      normalizedEntry.includes(normalizedTitle) ||
      normalizedTitle.includes(normalizedEntry)
    ) {
      return true;
    }

    const entryWords = normalizeWords(normalizedEntry);
    const titleWords = normalizeWords(normalizedTitle);
    const matches = entryWords.filter((word) => titleWords.includes(word));

    return matches.length >= Math.min(2, Math.max(entryWords.length, 1));
  });
}

function cityScopedScheduledActivities(
  activities: DraftObject[],
  places: DraftObject[],
  city: string
) {
  return activities
    .filter((activity) => !isLooseTipActivity(activity))
    .map((activity) => ({
      city: findCityForActivity(activity, places),
      title: getString(activity, "title") ?? "",
    }))
    .filter((activity) => {
      const activityCity = normalizeText(activity.city);
      return !activityCity || activityCity === normalizeText(city);
    });
}

function buildCityNoteDescription(
  sections: Map<NoteSectionName, string[]>
) {
  const activeSections = NOTE_SECTION_ORDER.filter(
    (section) => (sections.get(section)?.length ?? 0) > 0
  );

  if (activeSections.length === 1) {
    return sections.get(activeSections[0])?.join("; ") ?? null;
  }

  return activeSections
    .map((section) => `${section}: ${sections.get(section)?.join("; ")}`)
    .join("\n");
}

function categoryForSections(sections: Map<NoteSectionName, string[]>) {
  const activeSections = NOTE_SECTION_ORDER.filter(
    (section) => (sections.get(section)?.length ?? 0) > 0
  );

  if (activeSections.length !== 1) {
    return "admin_logistics";
  }

  switch (activeSections[0]) {
    case "Food":
      return "food_dining";
    case "Drinks & Nightlife":
      return "nightlife_entertainment";
    case "Shopping":
      return "shopping_tailor";
    case "Possible Sights":
      return "art_culture";
    case "Local Notes":
    default:
      return "admin_logistics";
  }
}

function mergeCityNotes({
  activities,
  debug,
  places,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  places: DraftObject[];
}) {
  const retainedActivities: DraftObject[] = [];
  const scheduledSourceActivities = activities.filter(
    (activity) => !shouldMoveToCityNotes(activity, activities)
  );
  const noteGroups = new Map<
    string,
    {
      city: string;
      sections: Map<NoteSectionName, string[]>;
      sourceTitles: string[];
    }
  >();

  for (const activity of activities) {
    if (!shouldMoveToCityNotes(activity, activities)) {
      retainedActivities.push(activity);
      continue;
    }

    const city = findCityForActivity(activity, places);

    if (!city) {
      retainedActivities.push(activity);
      continue;
    }

    const key = normalizeText(city);
    const group =
      noteGroups.get(key) ??
      {
        city,
        sections: new Map<NoteSectionName, string[]>(),
        sourceTitles: [],
      };
    const scheduledActivities = cityScopedScheduledActivities(
      scheduledSourceActivities,
      places,
      city
    );
    const noteSourceText = [getString(activity, "description"), getString(activity, "title")]
      .filter(Boolean)
      .join("\n");
    const entries = splitNoteText(noteSourceText).filter(
      (entry) => !itemOverlapsScheduledActivity(entry, scheduledActivities)
    );

    for (const entry of entries.length ? entries : [noteSourceText]) {
      const section = classifyNoteSection(entry);
      const currentEntries = group.sections.get(section) ?? [];

      if (!currentEntries.some((candidate) => normalizeText(candidate) === normalizeText(entry))) {
        currentEntries.push(entry);
      }

      group.sections.set(section, currentEntries);
    }

    const sourceTitle = getString(activity, "title");

    if (sourceTitle) {
      group.sourceTitles.push(sourceTitle);
    }

    noteGroups.set(key, group);
  }

  const mergedNotes = Array.from(noteGroups.values()).flatMap((group) => {
    const description = buildCityNoteDescription(group.sections);
    const sections = NOTE_SECTION_ORDER.filter(
      (section) => (group.sections.get(section)?.length ?? 0) > 0
    );

    if (!description || sections.length === 0) {
      return [];
    }

    debug.mergedCityNotes.push({
      city: group.city,
      sections,
      sourceTitles: group.sourceTitles,
    });

    return [
      {
        category: categoryForSections(group.sections),
        date: null,
        description,
        endTime: null,
        itemType: "note",
        startTime: null,
        title: `${group.city} Notes & Tips`,
      },
    ];
  });

  return [...retainedActivities, ...mergedNotes];
}

function suppressLodgingNotes({
  activities,
  debug,
  stays,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
  stays: DraftObject[];
}) {
  return activities.filter((activity) => {
    if (!isLodgingNoteActivity(activity, stays)) {
      return true;
    }

    const title = getString(activity, "title") ?? "Lodging note";
    const matchedStay =
      stays.find((stay) => {
        const stayName = normalizeText(getString(stay, "name"));
        return stayName && normalizeText(textFor(activity)).includes(stayName);
      }) ?? null;

    debug.foldedLodgingNotes.push({
      stayTitle: matchedStay ? getString(matchedStay, "name") : null,
      title,
    });

    return false;
  });
}

function markOptionalActivities({
  activities,
  debug,
}: {
  activities: DraftObject[];
  debug: TripDraftConsolidationDebug;
}) {
  return activities.map((activity) => {
    const title = getString(activity, "title");
    const text = normalizeText(textFor(activity));

    if (!title || /\(optional\)/i.test(title)) {
      return activity;
    }

    if (isPlannedAreaGroup(activity) && /\boptional stops?\b/.test(text)) {
      return activity;
    }

    if (!/\b(optional|if not tired|if we are not tired|if we're not tired|skip if|based on how we feel)\b/.test(text)) {
      return activity;
    }

    const updatedTitle = `${title} (Optional)`;

    debug.normalizedOptionalActivities.push({ title, updatedTitle });

    return {
      ...activity,
      title: updatedTitle,
    };
  });
}

function timelinePlanCounts({
  activities,
  transports,
}: {
  activities: DraftObject[];
  transports: DraftObject[];
}) {
  const counts = new Map<string, number>();

  for (const transport of transports) {
    const date = dateFor(transport);

    if (date) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }

  for (const activity of activities) {
    if (getString(activity, "itemType") === "note") {
      continue;
    }

    const date = dateFor(activity);

    if (date) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }

  const values = Array.from(counts.values());
  const maxPlansPerDay = values.length ? Math.max(...values) : 0;
  const averagePlansPerDay =
    values.length > 0
      ? Number((values.reduce((sum, count) => sum + count, 0) / values.length).toFixed(2))
      : 0;

  return {
    averagePlansPerDay,
    maxPlansPerDay,
    triggered: averagePlansPerDay > 8 || maxPlansPerDay > 14,
  };
}

function nonAssemblyMissingDetails(value: unknown) {
  return asArray(value).filter((item) => {
    const record = asRecord(item);
    return getString(record, "assemblySource") !== "trip_assembly";
  });
}

function createAssemblyCalls(
  debug: TripDraftConsolidationDebug
): AssemblyMissingDetail[] {
  const groupedChildren = new Map<
    string,
    {
      date: string | null;
      groupingKind: GroupingKind | null;
      groupedUnder: string;
      removedTitles: string[];
    }
  >();

  for (const item of debug.removedGroupedChildren) {
    const key = `${item.date ?? ""}|${item.groupedUnder}`;
    const group =
      groupedChildren.get(key) ??
      {
        date: item.date,
        groupingKind: item.groupingKind ?? null,
        groupedUnder: item.groupedUnder,
        removedTitles: [],
      };

    if (item.groupingKind && !group.groupingKind) {
      group.groupingKind = item.groupingKind;
    }

    if (!group.removedTitles.includes(item.removedTitle)) {
      group.removedTitles.push(item.removedTitle);
    }

    groupedChildren.set(key, group);
  }

  const groupedChildCalls = Array.from(groupedChildren.values())
    .filter((item) => isMakerVisibleGroupingKind(item.groupingKind))
    .map((item) => ({
      answerType: "confirm" as const,
      assemblySource: "trip_assembly" as const,
      confidence: "high" as const,
      evidence: `${item.removedTitles.join(", ")} ${
        item.removedTitles.length === 1 ? "was" : "were"
      } included under ${item.groupedUnder}.`,
      guessedValue: item.groupedUnder,
      prompt: `We grouped ${item.removedTitles.join(", ")} into ${item.groupedUnder}.`,
      reason:
        "The source treated these as one route, walk, option set, or same-site visit, so the traveler app keeps one card with included stops.",
      relatedTitle: item.groupedUnder,
      subjectType: "item" as const,
      targetField: "presentation" as const,
    }));

  return groupedChildCalls;
}

function hasExistingTransportDepartureQuestion({
  existingDetails,
  title,
}: {
  existingDetails: unknown[];
  title: string;
}) {
  const normalizedTitle = normalizeText(title);

  return existingDetails.some((item) => {
    const detail = asRecord(item);
    const subjectType = normalizeText(getString(detail, "subjectType"));
    const targetField = normalizeText(getString(detail, "targetField"));
    const relatedTitle = normalizeText(getString(detail, "relatedTitle"));
    const prompt = normalizeText(getString(detail, "prompt"));

    return (
      subjectType === "transport" &&
      (targetField.includes("departure") || targetField.includes("time")) &&
      Boolean(
        (relatedTitle && relatedTitle === normalizedTitle) ||
          (prompt && normalizedTitle && prompt.includes(normalizedTitle))
      )
    );
  });
}

function transportPolicyType(value: string | null) {
  const normalized = normalizeText(value);

  if (normalized === "car" || normalized === "rental car") {
    return "rental_car";
  }

  return normalized || null;
}

function transportCompletenessRecordForDraft(
  transport: DraftObject
): TransportCompletenessRecord {
  const title = getString(transport, "title") ?? "this transport";

  return {
    arrivalLocation: getStringFromKeys(transport, [
      "arrival",
      "arrivalLocation",
    ]),
    arrivalTime: getStringFromKeys(transport, ["arrivalTime", "endTime"]),
    confirmationLabel: getStringFromKeys(transport, [
      "confirmation",
      "reservation",
      "bookingNumber",
      "orderNumber",
    ]),
    departureLocation: getStringFromKeys(transport, [
      "departure",
      "departureLocation",
      "address",
    ]),
    departureTime: getStringFromKeys(transport, [
      "departureTime",
      "startTime",
      "time",
    ]),
    description: getString(transport, "description"),
    provider: getString(transport, "provider"),
    routeLabel: title,
    transportType: transportPolicyType(getString(transport, "type")),
  };
}

function transportTimeQuestionPrompt({
  policyRecord,
  title,
}: {
  policyRecord: TransportCompletenessRecord;
  title: string;
}) {
  if (
    policyRecord.transportType === "rental_car" ||
    policyRecord.transportType === "transfer"
  ) {
    return `What time is ${title}?`;
  }

  return `What time does ${title} depart?`;
}

function createTransportDepartureTimeQuestions({
  existingDetails,
  transports,
}: {
  existingDetails: unknown[];
  transports: DraftObject[];
}): AssemblyMissingDetail[] {
  return transports.flatMap((transport) => {
    const title = getString(transport, "title") ?? "this transport";
    const policyRecord = transportCompletenessRecordForDraft(transport);

    if (
      !isCriticalTransportRecord(policyRecord) ||
      policyRecord.departureTime ||
      hasTransportTimeEvidence(policyRecord) ||
      hasExistingTransportDepartureQuestion({ existingDetails, title })
    ) {
      return [];
    }

    return [
      {
        answerType: "text" as const,
        assemblySource: "trip_assembly" as const,
        confidence: "medium" as const,
        evidence: textFor(transport, [
          "title",
          "description",
          "departure",
          "arrival",
          "provider",
          "confirmation",
        ]) || null,
        guessedValue: null,
        prompt: transportTimeQuestionPrompt({ policyRecord, title }),
        reason:
          "Critical travel cards need a departure or pickup time for the Today timeline. You can leave it blank if this is not booked yet.",
        relatedTitle: title,
        subjectType: "transport" as const,
        targetField: "departureTime" as const,
      },
    ];
  });
}

function createWrongCityQuestions(
  debug: TripDraftConsolidationDebug
): AssemblyMissingDetail[] {
  return debug.wrongCityPlacements
    .filter((item) => item.action === "needs_review")
    .map((item) => ({
      answerType: "text" as const,
      assemblySource: "trip_assembly" as const,
      confidence: "medium" as const,
      evidence: item.assignedCity
        ? `${item.title} mentioned ${item.explicitCity} but was placed in ${item.assignedCity}.`
        : `${item.title} mentioned ${item.explicitCity}.`,
      guessedValue: null,
      prompt: `Where should ${item.title} belong?`,
      reason:
        "The source text names a city that conflicts with the dated leg, so this card needs placement before it can appear in the traveler timeline.",
      relatedTitle: item.title,
      subjectType: "item" as const,
      targetField: "placement" as const,
    }));
}

export function consolidateTripDraft(draft: unknown): {
  debug: TripDraftConsolidationDebug;
  draft: unknown;
} {
  const record = asRecord(draft);
  const existingDebug = getExistingAssemblyDebug(record);

  if (existingDebug) {
    return { debug: existingDebug, draft };
  }

  const debug = createEmptyConsolidationDebug();
  const places = cloneRecordArray(record.places);
  const stays = cloneRecordArray(record.stays);
  let transports = cloneRecordArray(record.transport);
  let activities = cloneRecordArray(record.activities).map(improvesGenericTourTitle);

  promoteTransportExtractedDetails(transports);
  ({ activities, transports } = normalizeRentalCarPickups({
    activities,
    debug,
    transports,
  }));
  ({ activities, transports } = promoteTravelActivitiesToTransport({
    activities,
    debug,
    transports,
  }));
  activities = suppressTransportDuplicates({ activities, debug, transports });
  activities = suppressStayFlowActivities({ activities, debug, stays });
  activities = suppressLodgingNotes({ activities, debug, stays });
  activities = suppressDayOverviewActivities({ activities, debug });
  activities = reconcileWrongCityAssignments({ activities, debug, places });
  activities = pruneParentChildActivities({ activities, debug });
  activities = groupMuseumOptionActivities({ activities, debug });
  activities = groupOpenDayLooseActivities({ activities, debug, places });
  activities = mergeCityNotes({ activities, debug, places });
  activities = markOptionalActivities({ activities, debug });
  debug.overproductionRetry = timelinePlanCounts({ activities, transports });
  const assemblyCalls = createAssemblyCalls(debug);
  const wrongCityQuestions = createWrongCityQuestions(debug);
  const transportDepartureTimeQuestions = createTransportDepartureTimeQuestions({
    existingDetails: asArray(record.missingDetails),
    transports,
  });

  return {
    debug,
    draft: {
      ...record,
      _assembly: {
        debug,
        version: ASSEMBLY_VERSION,
      },
      activities,
      missingDetails: [
        ...nonAssemblyMissingDetails(record.missingDetails),
        ...assemblyCalls,
        ...wrongCityQuestions,
        ...transportDepartureTimeQuestions,
      ],
      places,
      stays,
      transport: transports,
    },
  };
}
