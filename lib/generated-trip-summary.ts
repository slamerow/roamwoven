import type {
  StructuredTripRecords,
  TripRecordStatus,
} from "@/lib/generated-trip-model";
import type { ReviewDecisionSubjectType } from "@/lib/generated-trip-decisions";
import {
  getStructuredReviewCount,
  getStructuredReviewSections,
  type StructuredReviewEditField,
} from "@/lib/generated-trip-review";
import { isLegCityTipRecord } from "@/lib/trip-card-taxonomy";
import {
  getSoftTransportCompletenessIssues,
  getSourceBackedRequiredTransportIssues,
} from "@/lib/trip-transport-policy";
import {
  normalizeText,
  normalizeTripClockTime,
} from "@/lib/extraction/traveler-text";

export type GeneratedTripSummaryItem = {
  detail?: string;
  group?: string;
  meta: string;
  title: string;
};

export type GeneratedTripSummarySection = {
  count: number;
  id: "legs" | "transport" | "stays" | "activities" | "private-details" | "review";
  items: GeneratedTripSummaryItem[];
  title: string;
};

export type GeneratedTripSummaryCityNote = {
  detail: string | null;
  id: string;
  meta: string;
  title: string;
};

export type GeneratedTripSummaryDayEntry = {
  canMoveToCityTip: boolean;
  detail?: string;
  editFields: StructuredReviewEditField[];
  id: string;
  kind: "transport" | "stay" | "activity" | "review";
  meta: string;
  needsReview: boolean;
  subjectId: string;
  subjectType: ReviewDecisionSubjectType;
  targetLegId?: string | null;
  title: string;
};

export type GeneratedTripSummaryDay = {
  date: string;
  entries: GeneratedTripSummaryDayEntry[];
  id: string;
  label: string;
  needsReview: boolean;
  title: string;
};

export type GeneratedTripSummaryWarning = {
  detail: string;
  id: string;
  severity: "hard" | "quiet";
  subjectId: string;
  subjectType: ReviewDecisionSubjectType;
  title: string;
};

export type GeneratedTripSummaryView = {
  counts: {
    activities: number;
    places: number;
    plans: number;
    privateDetails: number;
    foodAndDining: number;
    review: number;
    stays: number;
    transport: number;
  };
  cityNotes: GeneratedTripSummaryCityNote[];
  dateRange: string;
  days: GeneratedTripSummaryDay[];
  destination: string;
  sections: GeneratedTripSummarySection[];
  isSemanticallyClean: boolean;
  title: string;
  warnings: GeneratedTripSummaryWarning[];
};

function isActiveStatus(status: TripRecordStatus) {
  return status !== "ignored";
}

function isProtectedVisibility(value: string) {
  return value === "traveler_password" || value === "maker_only";
}

function reviewSubjectKey(subjectType: string, subjectId: string | null) {
  return subjectId ? `${subjectType}:${subjectId}` : null;
}

function createActionReviewSubjectKeys(records: StructuredTripRecords) {
  const keys = new Set<string>();

  for (const section of getStructuredReviewSections(records)) {
    if (section.id === "notes") {
      continue;
    }

    for (const item of section.items) {
      if (item.subjectType === "review_question") {
        continue;
      }

      const key = reviewSubjectKey(item.subjectType, item.subjectId);

      if (key) {
        keys.add(key);
      }
    }
  }

  for (const question of records.reviewQuestions) {
    if (question.status !== "open") {
      continue;
    }

    const key = reviewSubjectKey(question.subjectType, question.subjectId);

    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

function subjectNeedsReview({
  reviewSubjectKeys,
  subjectId,
  subjectType,
}: {
  reviewSubjectKeys: Set<string>;
  subjectId: string;
  subjectType: string;
}) {
  return reviewSubjectKeys.has(`${subjectType}:${subjectId}`);
}

function parseDate(value: string | null) {
  if (!value || value === "needs-placement") {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null, includeYear = true) {
  const date = parseDate(value);

  if (!date) {
    return value && value !== "needs-placement" ? value : "";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function formatDateRangeValue(start: string | null, end: string | null) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const formattedStart = formatDate(start, true);
  const formattedEnd = formatDate(end, true);

  if (!start && !end) {
    return "";
  }

  if (!startDate || !endDate || start === end) {
    return formattedStart || formattedEnd || "";
  }

  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en", {
      month: "long",
      timeZone: "UTC",
    }).format(startDate);

    return `${month} ${startDate.getUTCDate()}-${endDate.getUTCDate()}, ${startDate.getUTCFullYear()}`;
  }

  if (sameYear) {
    return `${formatDate(start, false)} - ${formatDate(end, true)}`;
  }

  return `${formattedStart} - ${formattedEnd}`;
}

function formatDateRange(records: StructuredTripRecords) {
  const dates = records.days
    .map((day) => day.date)
    .filter((date) => date !== "needs-placement")
    .sort();

  if (records.trip.startDate && records.trip.endDate) {
    return formatDateRangeValue(records.trip.startDate, records.trip.endDate);
  }

  if (dates.length > 1) {
    return formatDateRangeValue(dates[0] ?? null, dates.at(-1) ?? null);
  }

  if (dates.length === 1) {
    return formatDate(dates[0] ?? null) || "Dates to confirm";
  }

  return "Dates to confirm";
}

function formatDestination(records: StructuredTripRecords) {
  if (records.trip.destinationSummary) {
    return records.trip.destinationSummary;
  }

  const places = Array.from(
    new Set(
      records.legs
        .filter((leg) => isActiveStatus(leg.status))
        .map((leg) => [leg.city, leg.country].filter(Boolean).join(", "))
        .filter(Boolean)
    )
  );

  return places.length > 0 ? places.slice(0, 5).join(" · ") : "Destinations to confirm";
}

function formatTime(value: string | null) {
  const time = normalizeTripClockTime(value) ?? value?.trim();

  if (!time) {
    return "";
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (!match) {
    return time;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function timeToMinutes(value: string | null) {
  const time = normalizeTripClockTime(value);

  if (!time) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

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

  return hour * 60 + minute;
}

function healthTextForItem(item: StructuredTripRecords["items"][number]) {
  return normalizeText(
    [item.title, item.description, item.locationName, item.address]
      .filter(Boolean)
      .join(" ")
  );
}

function healthTextForTransport(item: StructuredTripRecords["transport"][number]) {
  return normalizeText(
    [
      item.routeLabel,
      item.departureLocation,
      item.arrivalLocation,
      item.provider,
      item.confirmationLabel,
      item.description,
      item.transportType.replaceAll("_", " "),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function normalizeDuplicateTitle(value: string) {
  return normalizeText(value)
    .replace(/\b(reservation|booking|activity|visit|tour|ticket|tickets)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsForHealth(value: string) {
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
          "activity",
          "visit",
          "reservation",
          "booking",
        ].includes(word)
    );
}

function healthTextsOverlap(left: string, right: string) {
  const leftText = normalizeText(left);
  const rightText = normalizeText(right);

  if (!leftText || !rightText) {
    return false;
  }

  if (leftText.includes(rightText) || rightText.includes(leftText)) {
    return true;
  }

  const leftWords = wordsForHealth(leftText);
  const rightWords = wordsForHealth(rightText);
  const matches = leftWords.filter((word) => rightWords.includes(word));

  return matches.length >= Math.min(2, leftWords.length, rightWords.length);
}

function healthTextContainsPhrase(text: string, phrase: string | null) {
  const normalizedPhrase = normalizeText(phrase);

  return Boolean(normalizedPhrase && normalizeText(text).includes(normalizedPhrase));
}

function isStayFlowItem(item: StructuredTripRecords["items"][number]) {
  return /\b(check in|checkin|drop bags?|bag drop|store bags?|luggage storage|bag storage|stay|staying|lodging|hotel|hostel|airbnb|apartment)\b/.test(
    healthTextForItem(item)
  );
}

function isSeparateLuggageStorageItem(item: StructuredTripRecords["items"][number]) {
  const text = healthTextForItem(item);

  return /\b(luggage storage|bag storage|left luggage|storage locker|lockers?|station storage)\b/.test(
    text
  );
}

function isStayDuplicateFlow({
  item,
  stay,
}: {
  item: StructuredTripRecords["items"][number];
  stay: StructuredTripRecords["stays"][number];
}) {
  const itemText = healthTextForItem(item);
  const mentionsStayDirectly =
    healthTextContainsPhrase(itemText, stay.name) ||
    healthTextContainsPhrase(itemText, stay.address);
  const hasCheckInOrBagAction =
    /\b(check in|checkin|drop bags?|bag drop|store bags?)\b/.test(itemText);
  const hasLodgingContext =
    mentionsStayDirectly ||
    /\b(stay|staying|lodging|hotel|hostel|airbnb|apartment|accommodation|room)\b/.test(
      itemText
    );

  if (!hasCheckInOrBagAction || !hasLodgingContext) {
    return false;
  }

  if (mentionsStayDirectly) {
    return true;
  }

  return !isSeparateLuggageStorageItem(item);
}

function isTransportFlowItem(item: StructuredTripRecords["items"][number]) {
  return /\b(flight|fly|train|rail|bus|ferry|airport|station|transfer|depart|departure|arrive|arrival|rental car|car pickup|pick up car|pickup car|drive)\b/.test(
    healthTextForItem(item)
  );
}

function formatDayLabel(date: string, dayNumber: number) {
  return `Day ${dayNumber} · ${formatDate(date, false) || date}`;
}

function field({
  helpText,
  label,
  name,
  options,
  type = "text",
  value,
}: {
  helpText?: string;
  label: string;
  name: string;
  options?: StructuredReviewEditField["options"];
  type?: StructuredReviewEditField["type"];
  value: string | null;
}): StructuredReviewEditField {
  return {
    helpText,
    label,
    name,
    options,
    type,
    value: value ?? "",
  };
}

function editFieldsForTransport(
  item: StructuredTripRecords["transport"][number]
) {
  return [
    field({ label: "Title", name: "routeLabel", value: item.routeLabel }),
    field({ label: "Date", name: "date", type: "date", value: item.date }),
    field({
      label: "Departure",
      name: "departureLocation",
      value: item.departureLocation,
    }),
    field({
      label: "Departure time",
      name: "departureTime",
      type: "time",
      value: item.departureTime,
    }),
    field({
      label: "Arrival",
      name: "arrivalLocation",
      value: item.arrivalLocation,
    }),
    field({
      label: "Arrival time",
      name: "arrivalTime",
      type: "time",
      value: item.arrivalTime,
    }),
    field({ label: "Operator", name: "provider", value: item.provider }),
    field({
      label: "Confirmation / code",
      name: "confirmationLabel",
      value: item.confirmationLabel,
    }),
    field({
      label: "Details",
      name: "description",
      type: "textarea",
      value: item.description,
    }),
  ];
}

function editFieldsForStay(stay: StructuredTripRecords["stays"][number]) {
  return [
    field({ label: "Name", name: "name", value: stay.name }),
    field({
      label: "Check-in date",
      name: "checkInDate",
      type: "date",
      value: stay.checkInDate,
    }),
    field({
      label: "Check-in time",
      name: "checkInTime",
      type: "time",
      value: stay.checkInTime,
    }),
    field({
      label: "Check-out date",
      name: "checkOutDate",
      type: "date",
      value: stay.checkOutDate,
    }),
    field({
      label: "Check-out time",
      name: "checkOutTime",
      type: "time",
      value: stay.checkOutTime,
    }),
    field({ label: "Address", name: "address", value: stay.address }),
  ];
}

function editFieldsForItem(item: StructuredTripRecords["items"][number]) {
  return [
    field({ label: "Title", name: "title", value: item.title }),
    field({ label: "Date", name: "date", type: "date", value: item.date }),
    field({
      label: "Start time",
      name: "startTime",
      type: "time",
      value: item.startTime,
    }),
    field({
      label: "End time",
      name: "endTime",
      type: "time",
      value: item.endTime,
    }),
    field({ label: "Location", name: "locationName", value: item.locationName }),
    field({ label: "Address", name: "address", value: item.address }),
    field({ label: "Description", name: "description", type: "textarea", value: item.description }),
  ];
}

function titleForDay(records: StructuredTripRecords, day: StructuredTripRecords["days"][number]) {
  const primaryLeg = records.legs.find((leg) => leg.id === day.primaryLegId);

  if (primaryLeg?.displayName) {
    return primaryLeg.displayName;
  }

  return day.title;
}

function createTransportEntry(
  item: StructuredTripRecords["transport"][number],
  reviewSubjectKeys: Set<string>
): GeneratedTripSummaryDayEntry {
  const needsReview = subjectNeedsReview({
    reviewSubjectKeys,
    subjectId: item.id,
    subjectType: "transport",
  });

  return {
    canMoveToCityTip: false,
    detail: [
      [item.departureLocation, item.arrivalLocation].filter(Boolean).join(" -> "),
      item.provider,
      [formatTime(item.departureTime), formatTime(item.arrivalTime)]
        .filter(Boolean)
        .join(" - "),
      item.description,
    ]
      .filter(Boolean)
      .join(" · "),
    id: item.id,
    kind: "transport",
    meta: [formatTime(item.departureTime), item.transportType.replaceAll("_", " ")]
      .filter(Boolean)
      .join(" · "),
    needsReview,
    editFields: editFieldsForTransport(item),
    subjectId: item.id,
    subjectType: "transport",
    title: item.routeLabel,
  };
}

function createStayEntriesForDay(
  stay: StructuredTripRecords["stays"][number],
  date: string,
  reviewSubjectKeys: Set<string>
): GeneratedTripSummaryDayEntry[] {
  const entries: GeneratedTripSummaryDayEntry[] = [];
  const needsReview = subjectNeedsReview({
    reviewSubjectKeys,
    subjectId: stay.id,
    subjectType: "stay",
  });
  const addressDetail = stay.address
    ? stay.addressVisibility === "public"
      ? stay.address
      : "Exact address protected"
    : undefined;

  if (
    stay.checkInDate &&
    stay.checkOutDate &&
    stay.checkInDate <= date &&
    date < stay.checkOutDate
  ) {
    entries.push({
      canMoveToCityTip: false,
      detail: addressDetail,
      editFields: editFieldsForStay(stay),
      id: `${stay.id}-staying-${date}`,
      kind: "stay",
      meta:
        stay.checkInDate === date
          ? [stay.checkInTime, "Check-in"].filter(Boolean).join(" · ")
          : "Stay",
      needsReview,
      subjectId: stay.id,
      subjectType: "stay",
      title: `Staying: ${stay.name}`,
    });
  }

  return entries;
}

function createActivityEntry(
  item: StructuredTripRecords["items"][number],
  categoryById: Map<string, StructuredTripRecords["categories"][number]>,
  reviewSubjectKeys: Set<string>
): GeneratedTripSummaryDayEntry {
  const category = categoryById.get(item.categoryId);
  const needsReview = subjectNeedsReview({
    reviewSubjectKeys,
    subjectId: item.id,
    subjectType: "item",
  });

  return {
    canMoveToCityTip: item.itemType === "activity",
    detail:
      [item.address, item.description ?? item.locationName]
        .filter(Boolean)
        .join(" · ") || undefined,
    editFields: editFieldsForItem(item),
    id: item.id,
    kind: needsReview ? "review" : "activity",
    meta: [formatTime(item.startTime), category?.label].filter(Boolean).join(" · "),
    needsReview,
    subjectId: item.id,
    subjectType: "item",
    targetLegId: item.legId,
    title: item.title,
  };
}

function createSummaryCityNotes(
  records: StructuredTripRecords,
  activeItems: StructuredTripRecords["items"]
): GeneratedTripSummaryCityNote[] {
  const legById = new Map(records.legs.map((leg) => [leg.id, leg]));

  return activeItems
    .filter((item) => item.itemType === "note")
    .map((item) => {
      const leg = item.legId ? legById.get(item.legId) : null;
      const meta = leg
        ? [leg.displayName, leg.country].filter(Boolean).join(", ")
        : "City note";

      return {
        detail: item.description,
        id: item.id,
        meta,
        title: item.title,
      };
    });
}

function inferredActivityMinutes(item: StructuredTripRecords["items"][number]) {
  const explicit = timeToMinutes(item.startTime);

  if (explicit !== null) {
    return explicit;
  }

  const text = normalizeText(
    [item.title, item.description, item.categoryId].filter(Boolean).join(" ")
  );

  if (/\b(breakfast|bakery|coffee|cafe|brunch)\b/.test(text)) {
    return 9 * 60;
  }

  if (/\b(lunch|market)\b/.test(text)) {
    return 12 * 60;
  }

  if (/\b(dinner|restaurant|supper)\b/.test(text)) {
    return 19 * 60;
  }

  if (/\b(bar|pub|cocktail|beer|wine|nightlife|club|music)\b/.test(text)) {
    return 21 * 60;
  }

  if (
    /\b(museum|palace|cathedral|church|synagogue|gallery|park|garden|castle|tour|walk|sightseeing|shopping|shop)\b/.test(
      text
    )
  ) {
    return 13 * 60;
  }

  return 15 * 60;
}

function sortEntriesForDay(
  entries: Array<{
    entry: GeneratedTripSummaryDayEntry;
    sortOrder?: number;
    sortMinutes: number | null;
  }>
) {
  return entries
    .map((item, index) => ({ ...item, index }))
    .sort((left, right) => {
      const leftMinutes = left.sortMinutes ?? 15 * 60;
      const rightMinutes = right.sortMinutes ?? 15 * 60;

      if (leftMinutes !== rightMinutes) {
        return leftMinutes - rightMinutes;
      }

      const kindOrder: Record<GeneratedTripSummaryDayEntry["kind"], number> = {
        stay: 0,
        transport: 1,
        activity: 2,
        review: 3,
      };
      const kindDelta = kindOrder[left.entry.kind] - kindOrder[right.entry.kind];

      return (
        kindDelta ||
        (left.sortOrder ?? left.index) - (right.sortOrder ?? right.index)
      );
    })
    .map((item) => item.entry);
}

function isLegLevelTip(item: StructuredTripRecords["items"][number]) {
  return isLegCityTipRecord(item);
}

function createSummaryDays(
  records: StructuredTripRecords,
  activeItems: StructuredTripRecords["items"]
): GeneratedTripSummaryDay[] {
  const activeTransport = records.transport.filter((item) =>
    isActiveStatus(item.status)
  );
  const activeStays = records.stays.filter((stay) => isActiveStatus(stay.status));
  const categoryById = new Map(
    records.categories.map((category) => [category.id, category])
  );
  const reviewSubjectKeys = createActionReviewSubjectKeys(records);
  const datedItems = activeItems.filter((item) => item.date);
  const undatedItems = activeItems.filter(
    (item) => !item.date && !isLegLevelTip(item)
  );

  const constrainedActivityMinutes = (
    item: StructuredTripRecords["items"][number],
    dayTransport: StructuredTripRecords["transport"]
  ) => {
    const base = inferredActivityMinutes(item);
    const incomingArrivalMinutes = dayTransport
      .filter(
        (transport) =>
          Boolean(item.legId) && transport.legId === item.legId
      )
      .map((transport) => timeToMinutes(transport.arrivalTime))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0];

    if (incomingArrivalMinutes === undefined) {
      return base;
    }

    const text = normalizeText(
      [item.title, item.description, item.categoryId].filter(Boolean).join(" ")
    );
    const isImmediateArrivalTask =
      /\b(?:pick up|pickup|collect).{0,24}\b(?:card|pass|key)\b/.test(text);

    if (isImmediateArrivalTask) {
      return incomingArrivalMinutes + 1;
    }

    return Math.max(
      base,
      incomingArrivalMinutes + 15
    );
  };

  const days = records.days
    .filter((day) => day.date !== "needs-placement")
    .map((day) => {
      const dayTransport = activeTransport.filter(
        (item) => item.date === day.date
      );
      const entries = sortEntriesForDay([
        ...dayTransport
          .map((item) => ({
            entry: createTransportEntry(item, reviewSubjectKeys),
            sortMinutes: timeToMinutes(item.departureTime),
          })),
        ...activeStays
          .flatMap((stay) =>
            createStayEntriesForDay(stay, day.date, reviewSubjectKeys).map(
              (entry) => ({
                entry,
                sortMinutes:
                  stay.checkInDate === day.date
                    ? timeToMinutes(stay.checkInTime) ?? 16 * 60
                    : 0,
              })
            )
          ),
        ...datedItems
          .filter((item) => item.date === day.date)
          .map((item) => ({
            entry: createActivityEntry(item, categoryById, reviewSubjectKeys),
            sortMinutes: constrainedActivityMinutes(item, dayTransport),
            sortOrder: item.sortOrder,
          })),
      ]);

      return {
        date: day.date,
        entries,
        id: day.id,
        label: formatDayLabel(day.date, day.dayNumber),
        needsReview: entries.some((entry) => entry.needsReview),
        title: titleForDay(records, day),
      };
    })
    .filter((day) => day.entries.length > 0);

  if (undatedItems.length > 0) {
    days.push({
      date: "needs-placement",
      entries: undatedItems.map((item) =>
        createActivityEntry(item, categoryById, reviewSubjectKeys)
      ),
      id: `${records.trip.id}-needs-placement`,
      label: "Needs placement",
      needsReview: undatedItems.some((item) =>
        subjectNeedsReview({
          reviewSubjectKeys,
          subjectId: item.id,
          subjectType: "item",
        })
      ),
      title: "Cards without a date",
    });
  }

  return days;
}

function createSummaryWarnings({
  days,
  records,
}: {
  days: GeneratedTripSummaryDay[];
  records: StructuredTripRecords;
}): GeneratedTripSummaryWarning[] {
  const activeItems = records.items.filter(
    (item) => isActiveStatus(item.status) && item.itemType === "activity"
  );
  const unresolvedActiveItems = activeItems.filter(
    (item) => item.status !== "confirmed"
  );
  const activeStays = records.stays.filter((stay) => isActiveStatus(stay.status));
  const activeTransport = records.transport.filter((item) =>
    isActiveStatus(item.status)
  );
  const bloatWarnings = days
    .filter((day) => {
      const sourceDay = records.days.find((item) => item.id === day.id);
      const activityCount = day.entries.filter(
        (entry) => entry.kind === "activity" || entry.kind === "review"
      ).length;

      return activityCount >= 7 && sourceDay?.status !== "confirmed";
    })
    .map((day) => ({
      detail:
        "This day still has 7 or more visible activity cards after assembly. Consider grouping a true route, moving loose ideas to city tips, or removing duplicates.",
      id: `${day.id}-activity-bloat`,
      severity: "quiet" as const,
      subjectId: day.id,
      subjectType: "day" as const,
      title: `${day.label} has a lot of visible cards`,
    }));
  const criticalTransportWarnings = records.transport
    .filter((item) => isActiveStatus(item.status))
    .filter((item) => item.status !== "confirmed")
    .flatMap((item) => {
      const issues = getSourceBackedRequiredTransportIssues(item);

      if (issues.length === 0) {
        return [];
      }

      return [{
        detail:
          `Source evidence includes ${issues.map((issue) => issue.label).join(", ")} that did not make it onto the travel row. Check the Travel card or keep Roamwoven's current best-supported version.`,
        id: `${item.id}-critical-transport-details`,
        severity: "hard" as const,
        subjectId: item.id,
        subjectType: "transport" as const,
        title: `${item.routeLabel} is missing critical travel details`,
      }];
    });
  const softTransportCompletenessWarnings = records.transport
    .filter((item) => isActiveStatus(item.status))
    .filter((item) => item.status !== "confirmed")
    .flatMap((item) => {
      const issues = getSoftTransportCompletenessIssues(item);

      if (issues.length === 0) {
        return [];
      }

      return [{
        detail:
          `Source evidence appears to include ${issues.map((issue) => issue.label).join(", ")}. This is useful to add, but it should not block publishing.`,
        id: `${item.id}-soft-transport-details`,
        severity: "quiet" as const,
        subjectId: item.id,
        subjectType: "transport" as const,
        title: `${item.routeLabel} could use one more travel detail`,
      }];
    });
  const duplicateTitleWarnings = Array.from(
    unresolvedActiveItems.reduce((groups, item) => {
      const key = [
        item.date,
        item.startTime ?? "",
        normalizeDuplicateTitle(item.title),
      ].join("|");

      if (!item.date || !normalizeDuplicateTitle(item.title)) {
        return groups;
      }

      groups.set(key, [...(groups.get(key) ?? []), item]);
      return groups;
    }, new Map<string, typeof unresolvedActiveItems>())
  )
    .filter(([, items]) => items.length > 1)
    .map(([, items]) => ({
      detail:
        "Multiple visible activity cards have the same date, time, and title. Review, merge, or remove the duplicate.",
      id: `${items[0]?.id ?? "activity"}-duplicate-title`,
      severity: "hard" as const,
      subjectId: items[0]?.id ?? records.trip.id,
      subjectType: "item" as const,
      title: `${items[0]?.title ?? "Activity"} appears more than once`,
    }));
  const stayCollisionWarnings = unresolvedActiveItems
    .filter(isStayFlowItem)
    .flatMap((item) => {
      const matchingStay = activeStays.find((stay) => {
        if (!item.date || !stay.checkInDate) {
          return false;
        }

        const sameStayWindow =
          stay.checkOutDate && stay.checkInDate
            ? stay.checkInDate <= item.date && item.date <= stay.checkOutDate
            : stay.checkInDate === item.date;

        return sameStayWindow && isStayDuplicateFlow({ item, stay });
      });

      if (!matchingStay) {
        return [];
      }

      return [
        {
          detail:
            "This card looks like normal stay/check-in/drop-bags flow already covered by the Stay row.",
          id: `${item.id}-stay-collision`,
          severity: "hard" as const,
          subjectId: item.id,
          subjectType: "item" as const,
          title: `${item.title} duplicates a stay row`,
        },
      ];
    });
  const transportCollisionWarnings = unresolvedActiveItems
    .filter(isTransportFlowItem)
    .flatMap((item) => {
      const matchingTransport = activeTransport.find(
        (transport) =>
          item.date &&
          transport.date === item.date &&
          (healthTextsOverlap(item.title, transport.routeLabel) ||
            healthTextsOverlap(healthTextForItem(item), healthTextForTransport(transport)))
      );

      if (!matchingTransport) {
        return [];
      }

      return [
        {
          detail:
            "This card looks like movement already covered by the Travel row. Merge the useful details into Travel and remove the duplicate card.",
          id: `${item.id}-transport-collision`,
          severity: "hard" as const,
          subjectId: item.id,
          subjectType: "item" as const,
          title: `${item.title} duplicates a travel row`,
        },
      ];
    });

  return [
    ...criticalTransportWarnings,
    ...softTransportCompletenessWarnings,
    ...duplicateTitleWarnings,
    ...stayCollisionWarnings,
    ...transportCollisionWarnings,
    ...bloatWarnings,
  ];
}

function createReviewItems(
  records: StructuredTripRecords
): GeneratedTripSummaryItem[] {
  return getStructuredReviewSections(records)
    .filter((section) => section.id !== "notes")
    .flatMap((section) =>
      section.items.map((item) => ({
        detail: item.detail,
        meta: item.meta || section.title,
        title: item.title,
      }))
    );
}

function createSummarySections(
  records: StructuredTripRecords,
  activeItems: StructuredTripRecords["items"],
  review: number
): GeneratedTripSummarySection[] {
  const activeLegs = records.legs.filter((leg) => isActiveStatus(leg.status));
  const activeStays = records.stays.filter((stay) => isActiveStatus(stay.status));
  const activeTransport = records.transport.filter((item) =>
    isActiveStatus(item.status)
  );
  const protectedPrivateDetails = records.privateDetails.filter((detail) =>
    isProtectedVisibility(detail.visibility)
  );
  const categoryById = new Map(
    records.categories.map((category) => [category.id, category])
  );

  const activeActivityItems = activeItems.filter(
    (item) => item.itemType === "activity"
  );

  return [
    {
      count: activeLegs.length,
      id: "legs",
      items: activeLegs.map((leg) => ({
        detail: leg.summary ?? undefined,
        meta: formatDateRangeValue(leg.arriveDate, leg.leaveDate),
        title: leg.displayName,
      })),
      title: "Legs",
    },
    {
      count: activeTransport.length,
      id: "transport",
      items: activeTransport.map((item) => ({
        detail: [
          [item.departureLocation, item.arrivalLocation].filter(Boolean).join(" -> "),
          item.provider,
          [formatTime(item.departureTime), formatTime(item.arrivalTime)]
            .filter(Boolean)
            .join(" - "),
        ]
          .filter(Boolean)
          .join(" · "),
        meta: formatDate(item.date) || item.transportType,
        title: item.routeLabel,
      })),
      title: "Transport",
    },
    {
      count: activeStays.length,
      id: "stays",
      items: activeStays.map((stay) => ({
        detail: stay.address
          ? stay.addressVisibility === "public"
            ? stay.address
            : "Private address protected"
          : undefined,
        meta: formatDateRangeValue(stay.checkInDate, stay.checkOutDate),
        title: stay.name,
      })),
      title: "Stays",
    },
    {
      count: activeActivityItems.length,
      id: "activities",
      items: activeActivityItems.map((item) => {
        const category = categoryById.get(item.categoryId);

        return {
          detail: item.description ?? item.locationName ?? undefined,
          group: category?.label ?? "Other plans",
          meta: [
            formatDate(item.date),
            item.startTime,
          ]
            .filter(Boolean)
            .join(" · "),
          title: item.title,
        };
      }),
      title: "Activities",
    },
    {
      count: protectedPrivateDetails.length,
      id: "private-details",
      items: protectedPrivateDetails.map((detail) => ({
        detail: detail.reason ?? undefined,
        meta: detail.detailType.replaceAll("_", " "),
        title: detail.label,
      })),
      title: "Protected details",
    },
    {
      count: review,
      id: "review",
      items: createReviewItems(records),
      title: "Review items",
    },
  ];
}

function countTimelinePlans(days: GeneratedTripSummaryDay[]) {
  return days.reduce(
    (count, day) =>
      count +
      day.entries.filter(
        (entry) => entry.kind !== "stay" && entry.kind !== "review"
      ).length,
    0
  );
}

export function createGeneratedTripSummaryView(
  records: StructuredTripRecords
): GeneratedTripSummaryView {
  const activeItems = records.items.filter((item) => isActiveStatus(item.status));
  const primaryItems = activeItems.filter((item) => !item.parentItemId);
  const review = getStructuredReviewCount(records);
  const days = createSummaryDays(records, primaryItems);
  const warnings = createSummaryWarnings({ days, records });
  const hardWarnings = warnings.filter((warning) => warning.severity === "hard");

  return {
    counts: {
      activities: primaryItems.filter((item) => item.itemType === "activity").length,
      places: records.legs.filter((leg) => isActiveStatus(leg.status)).length,
      plans: countTimelinePlans(days),
      privateDetails: records.privateDetails.filter((detail) =>
        isProtectedVisibility(detail.visibility)
      ).length,
      foodAndDining: primaryItems.filter((item) => item.categoryId === "food_dining")
        .length,
      review,
      stays: records.stays.filter((stay) => isActiveStatus(stay.status)).length,
      transport: records.transport.filter((item) => isActiveStatus(item.status))
        .length,
    },
    cityNotes: createSummaryCityNotes(records, primaryItems),
    dateRange: formatDateRange(records),
    days,
    destination: formatDestination(records),
    sections: createSummarySections(records, primaryItems, review),
    isSemanticallyClean: review === 0 && hardWarnings.length === 0,
    title: records.trip.travelerAppTitle,
    warnings,
  };
}
