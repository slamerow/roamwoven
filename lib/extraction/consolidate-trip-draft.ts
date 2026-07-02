type DraftObject = Record<string, unknown>;

type NoteSectionName =
  | "Food"
  | "Drinks & Nightlife"
  | "Shopping"
  | "Local Notes"
  | "Possible Sights";

type AssemblyMissingDetail = {
  answerType: "confirm";
  assemblySource: "trip_assembly";
  confidence: "high";
  evidence: string | null;
  guessedValue: string;
  prompt: string;
  reason: string;
  relatedTitle: string | null;
  subjectType: "item";
  targetField: "presentation";
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
  suppressedTransportActivities: Array<{
    date: string | null;
    matchedTransportTitle: string;
    removedTitle: string;
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

function isTransportActionText(value: string) {
  return /\b(flight|fly|train|rail|bus|ferry|airport|station|transfer|depart|departure|arrive|arrival|get to|travel to)\b/.test(
    normalizeText(value)
  );
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

  if (isSeparateLocalMovement(activityText)) {
    return null;
  }

  const sameDayTransports = transports.filter((transport) => dateFor(transport) === date);
  const scored = sameDayTransports
    .map((transport) => ({
      score: transportMatchScore(activity, transport),
      transport,
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score >= 2 ? scored[0].transport : null;
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

function isSameSiteGroup(record: DraftObject) {
  const text = normalizeText(textFor(record));

  return /\b(complex|palace|castle|gardens|grounds|campus|estate|including|inside|within)\b/.test(
    text
  );
}

function isTourGroup(record: DraftObject) {
  return /\b(tour|walking tour|walk)\b/.test(normalizeText(getString(record, "title")));
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

    const sameDayChildren = activities
      .map((child, childIndex) => ({ child, childIndex }))
      .filter(
        ({ child, childIndex }) =>
          childIndex !== parentIndex &&
          !removedIndexes.has(childIndex) &&
          dateFor(child) === dateFor(parent) &&
          childIsContainedInParent(parent, child)
      );

    if (sameDayChildren.length === 0) {
      return;
    }

    const standaloneChildren = sameDayChildren.filter(({ child }) =>
      hasStandaloneAnchor(child)
    );

    if (
      isBroadParent(parent) &&
      (sameDayChildren.length >= 2 || standaloneChildren.length > 0)
    ) {
      removedIndexes.add(parentIndex);
      debug.removedDuplicateParents.push({
        date: dateFor(parent),
        reason: standaloneChildren.length
          ? "A named/timed child card covered the broad parent."
          : "Named child cards covered the broad parent.",
        removedTitle: getString(parent, "title") ?? "Untitled activity",
        survivingTitles: sameDayChildren.map(
          ({ child }) => getString(child, "title") ?? "Untitled activity"
        ),
      });
      return;
    }

    if (!isTourGroup(parent) && !isSameSiteGroup(parent)) {
      return;
    }

    for (const { child, childIndex } of sameDayChildren) {
      if (hasStandaloneAnchor(child)) {
        continue;
      }

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
  const title = getString(activity, "title");
  const text = normalizeText(textFor(activity));

  if (!text || timeFor(activity)) {
    return false;
  }

  if (/\b(check in|check-in|drop bags?|bag drop|arrive|arrival)\b/.test(text)) {
    return false;
  }

  if (
    !/\b(stay|lodging|hotel|hostel|airbnb|apartment|private room|shared bathroom|bathroom|amount due|pay at arrival|check in|check out)\b/.test(
      text
    )
  ) {
    return false;
  }

  return stays.some((stay) => {
    const stayName = normalizeText(getString(stay, "name"));
    return Boolean(stayName && title && normalizeText(title).includes(stayName));
  }) || /\b(private room|shared bathroom|amount due|pay at arrival|lodging note)\b/.test(text);
}

function isLooseTipActivity(activity: DraftObject) {
  const title = getString(activity, "title");
  const description = getString(activity, "description");
  const text = normalizeText([title, description].filter(Boolean).join(" "));

  if (!text || timeFor(activity) || getString(activity, "endTime")) {
    return false;
  }

  if (
    /\b(reservation|reserved|booked|booking|ticket|tickets|timed|confirmation|provider|paid|paypal)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    getString(activity, "itemType") === "note" ||
    /\b(also noted|ideas?|recommendations?|where to eat|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls?|shopping ideas|local tips?|could visit|maybe visit|if time|possible sights?)\b/.test(
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

  return parsedDate >= arrive && parsedDate <= leave;
}

function cityForPlace(place: DraftObject) {
  return getString(place, "city") ?? getString(place, "displayName");
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
  const parentCalls = debug.removedDuplicateParents.map((item) => ({
    answerType: "confirm" as const,
    assemblySource: "trip_assembly" as const,
    confidence: "high" as const,
    evidence: item.survivingTitles.join("; "),
    guessedValue: item.survivingTitles.join("; ") || "Named child cards",
    prompt: `We removed ${item.removedTitle} because specific cards covered it.`,
    reason: item.reason,
    relatedTitle: item.survivingTitles[0] ?? null,
    subjectType: "item" as const,
    targetField: "presentation" as const,
  }));
  const groupedChildCalls = debug.removedGroupedChildren.map((item) => ({
    answerType: "confirm" as const,
    assemblySource: "trip_assembly" as const,
    confidence: "high" as const,
    evidence: `${item.removedTitle} was included under ${item.groupedUnder}.`,
    guessedValue: item.groupedUnder,
    prompt: `We grouped ${item.removedTitle} under ${item.groupedUnder}.`,
    reason:
      "The source treated these as one route, walk, tour, or same-site visit, so the traveler app keeps one card with included stops.",
    relatedTitle: item.groupedUnder,
    subjectType: "item" as const,
    targetField: "presentation" as const,
  }));
  const cityNoteCalls = debug.mergedCityNotes.map((item) => ({
    answerType: "confirm" as const,
    assemblySource: "trip_assembly" as const,
    confidence: "high" as const,
    evidence: item.sourceTitles.join("; ") || null,
    guessedValue: `${item.city} Notes & Tips`,
    prompt: `We moved loose ${item.city} recommendations into city notes.`,
    reason:
      "Loose food, drink, shopping, and local ideas should not create dated activity cards unless the source ties them to a day.",
    relatedTitle: `${item.city} Notes & Tips`,
    subjectType: "item" as const,
    targetField: "presentation" as const,
  }));

  return [...parentCalls, ...groupedChildCalls, ...cityNoteCalls];
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
    suppressedTransportActivities: [],
  };
  const places = cloneRecordArray(record.places);
  const stays = cloneRecordArray(record.stays);
  const transports = cloneRecordArray(record.transport);
  let activities = cloneRecordArray(record.activities).map(improvesGenericTourTitle);

  activities = suppressTransportDuplicates({ activities, debug, transports });
  activities = pruneParentChildActivities({ activities, debug });
  activities = suppressLodgingNotes({ activities, debug, stays });
  activities = mergeCityNotes({ activities, debug, places });
  activities = markOptionalActivities({ activities, debug });
  debug.overproductionRetry = timelinePlanCounts({ activities, transports });
  const assemblyCalls = createAssemblyCalls(debug);

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
      ],
      places,
      stays,
      transport: transports,
    },
  };
}
