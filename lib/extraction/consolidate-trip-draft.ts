type DraftObject = Record<string, unknown>;

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
  subjectType: "item";
  targetField: "date" | "placement" | "presentation";
};

export type TripDraftConsolidationDebug = {
  foldedLodgingNotes: Array<{
    title: string;
    stayTitle: string | null;
  }>;
  mergedCityNotes: Array<{
    city: string;
    sections: string[];
    sourceTitles: string[];
  }>;
  normalizedOptionalActivities: Array<{
    title: string;
    updatedTitle: string;
  }>;
  overproductionRetry: {
    averagePlansPerDay: number;
    maxPlansPerDay: number;
    triggered: boolean;
  };
  removedDuplicateParents: Array<{
    date: string | null;
    reason: string;
    removedTitle: string;
    survivingTitles: string[];
  }>;
  removedGroupedChildren: Array<{
    date: string | null;
    groupedUnder: string;
    removedTitle: string;
  }>;
  suppressedDayOverviews: Array<{
    date: string | null;
    removedTitle: string;
  }>;
  suppressedTransportActivities: Array<{
    date: string | null;
    matchedTransportTitle: string;
    removedTitle: string;
  }>;
  wrongCityPlacements: Array<{
    action: "moved_to_city_notes" | "needs_review";
    assignedCity: string | null;
    date: string | null;
    explicitCity: string;
    title: string;
  }>;
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

function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
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

  const matches = value.matchAll(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/gi);
  const times: string[] = [];

  for (const match of matches) {
    const time = normalizeClockTime(
      `${match[1]}:${match[2]}${match[3] ? ` ${match[3]}` : ""}`
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

function isTransportActionText(value: string) {
  return /\b(flight|fly|train|rail|bus|ferry|airport|station|transfer|depart|departure|arrive|arrival|get to|travel to|rental car|car pickup|pick up car|pickup car|drive)\b/.test(
    normalizeText(value)
  );
}

function isRentalCarText(value: string | null | undefined) {
  return /\b(rental car|car rental|car pickup|pick up car|pickup car|hire car)\b/.test(
    normalizeText(value)
  );
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

function isSeparateLocalMovement(value: string) {
  const text = normalizeText(value);

  return (
    /\b(take|catch|ride|get on|board|leave for|go to)\b/.test(text) &&
    /\b(metro|subway|bus|tram|taxi|uber|lyft|shuttle|driver|private transfer|car service|pickup|pick up)\b/.test(
      text
    )
  );
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

  const sameDayTransports = transports.filter((transport) => dateFor(transport) === date);
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
    activityDescription,
    getString(activity, "address") ? `Address: ${getString(activity, "address")}.` : null,
    getStringFromKeys(activity, ["phone", "contactPhone", "providerPhone"])
      ? `Phone: ${getStringFromKeys(activity, ["phone", "contactPhone", "providerPhone"])}.`
      : null,
    getStringFromKeys(activity, ["reservation", "bookingNumber", "orderNumber", "confirmation"])
      ? `Confirmation: ${getStringFromKeys(activity, ["reservation", "bookingNumber", "orderNumber", "confirmation"])}.`
      : null,
    getString(activity, "openingHours") ? `Hours: ${getString(activity, "openingHours")}.` : null,
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

function hasStandaloneAnchor(record: DraftObject) {
  const text = normalizeText(textFor(record));

  return Boolean(
    timeFor(record) ||
      getString(record, "endTime") ||
      /\b(ticket|tickets|timed|reserved|reservation|booking|confirmation|provider|paid|paypal|voucher|entry at|starts at)\b/.test(
        text
      )
  );
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
  const text = normalizeText(textFor(record));

  return /\b(complex|palace|castle|gardens|grounds|campus|estate|including|inside|within)\b/.test(
    text
  );
}

function isTourGroup(record: DraftObject) {
  return /\b(tour|walking tour|walk)\b/.test(normalizeText(getString(record, "title")));
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

  if (!isSameSiteGroup(parent)) {
    return false;
  }

  const parentWords = normalizeWords(textFor(parent));
  const childWords = normalizeWords(textFor(child));
  const sharedWords = childWords.filter((word) => parentWords.includes(word));

  return sharedWords.some((word) => word.length >= 5);
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
    parent.description = appendUniqueSentence(
      getString(parent, "description"),
      `Includes: ${childLabel}.`
    );
  }

  if (childDescription) {
    parent.description = appendUniqueSentence(
      getString(parent, "description"),
      childDescription
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
  const title = normalizeText(getString(activity, "title"));
  const text = normalizeText(textFor(activity));

  if (!title || isNoteLikeRecord(activity)) {
    return false;
  }

  if (
    /\b(ticket|tickets|reservation|booking|confirmation|provider|paid|paypal)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    /\bday\s+\d+\b/.test(title) ||
    /\b(day overview|day summary|daily overview|daily plan|overview day)\b/.test(
      title
    )
  );
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

    if (!isTourGroup(parent) && !isSameSiteGroup(parent)) {
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

function isLooseTipActivity(activity: DraftObject) {
  const title = getString(activity, "title");
  const description = getString(activity, "description");
  const text = normalizeText([title, description].filter(Boolean).join(" "));

  if (!text || timeFor(activity) || getString(activity, "endTime")) {
    return false;
  }

  const bookingGuardText = text.replace(/\bticket machines?\b/g, " ");

  if (
    /\b(reservation|reserved|booked|booking|ticket|tickets|timed|confirmation|provider|paid|paypal)\b/.test(
      bookingGuardText
    )
  ) {
    return false;
  }

  return (
    getString(activity, "itemType") === "note" ||
    /\b(also noted|notes?\s*(?:and|&)?\s*tips?|ideas?|recommendations?|where to eat|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls?|shopping ideas|shopping notes?|transport notes?|transit tips?|local tips?|could visit|maybe visit|if time|possible sights?|things to check out)\b/.test(
      text
    )
  );
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

function findDatePlace(activity: DraftObject, places: DraftObject[]) {
  return places.find((place) => placeContainsDate(place, dateFor(activity))) ?? null;
}

function findExplicitCityPlace(activity: DraftObject, places: DraftObject[]) {
  const text = normalizeText(textFor(activity));

  return (
    places.find((place) => {
      const city = normalizeText(cityForPlace(place));
      return Boolean(city && text.includes(city));
    }) ?? null
  );
}

function findCityForActivity(activity: DraftObject, places: DraftObject[]) {
  const text = normalizeText(textFor(activity));
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
    (activity) => !isLooseTipActivity(activity)
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
    if (!isLooseTipActivity(activity)) {
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
        groupedUnder: item.groupedUnder,
        removedTitles: [],
      };

    if (!group.removedTitles.includes(item.removedTitle)) {
      group.removedTitles.push(item.removedTitle);
    }

    groupedChildren.set(key, group);
  }

  const groupedChildCalls = Array.from(groupedChildren.values()).map((item) => ({
    answerType: "confirm" as const,
    assemblySource: "trip_assembly" as const,
    confidence: "high" as const,
    evidence: `${item.removedTitles.join(", ")} ${
      item.removedTitles.length === 1 ? "was" : "were"
    } included under ${item.groupedUnder}.`,
    guessedValue: item.groupedUnder,
    prompt: `We grouped ${item.removedTitles.join(", ")} into ${item.groupedUnder}.`,
    reason:
      "The source treated these as one route, walk, tour, or same-site visit, so the traveler app keeps one card with included stops.",
    relatedTitle: item.groupedUnder,
    subjectType: "item" as const,
    targetField: "presentation" as const,
  }));

  return groupedChildCalls;
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
  const debug: TripDraftConsolidationDebug = {
    foldedLodgingNotes: [],
    mergedCityNotes: [],
    normalizedOptionalActivities: [],
    overproductionRetry: {
      averagePlansPerDay: 0,
      maxPlansPerDay: 0,
      triggered: false,
    },
    removedDuplicateParents: [],
    removedGroupedChildren: [],
    suppressedDayOverviews: [],
    suppressedTransportActivities: [],
    wrongCityPlacements: [],
  };
  const places = cloneRecordArray(record.places);
  const stays = cloneRecordArray(record.stays);
  const transports = cloneRecordArray(record.transport);
  let activities = cloneRecordArray(record.activities).map(improvesGenericTourTitle);

  promoteTransportExtractedDetails(transports);
  activities = suppressTransportDuplicates({ activities, debug, transports });
  activities = suppressStayFlowActivities({ activities, debug, stays });
  activities = suppressLodgingNotes({ activities, debug, stays });
  activities = suppressDayOverviewActivities({ activities, debug });
  activities = reconcileWrongCityAssignments({ activities, debug, places });
  activities = mergeCityNotes({ activities, debug, places });
  activities = pruneParentChildActivities({ activities, debug });
  activities = markOptionalActivities({ activities, debug });
  debug.overproductionRetry = timelinePlanCounts({ activities, transports });
  const assemblyCalls = createAssemblyCalls(debug);
  const wrongCityQuestions = createWrongCityQuestions(debug);

  return {
    debug,
    draft: {
      ...record,
      _assembly: {
        debug,
        version: 1,
      },
      activities,
      missingDetails: [
        ...nonAssemblyMissingDetails(record.missingDetails),
        ...assemblyCalls,
        ...wrongCityQuestions,
      ],
      places,
      stays,
      transport: transports,
    },
  };
}
