import type {
  StructuredTripRecords,
  TripRecordStatus,
} from "@/lib/generated-trip-model";
import { getStructuredReviewCount } from "@/lib/generated-trip-review";

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

export type GeneratedTripSummaryDayEntry = {
  detail?: string;
  id: string;
  kind: "transport" | "stay" | "activity" | "review";
  meta: string;
  needsReview: boolean;
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
  dateRange: string;
  days: GeneratedTripSummaryDay[];
  destination: string;
  sections: GeneratedTripSummarySection[];
  isReadyForPublishReview: boolean;
  title: string;
};

function isActiveStatus(status: TripRecordStatus) {
  return status !== "ignored";
}

function needsRecordReview(record: {
  reviewRequired: boolean;
  status: TripRecordStatus;
}) {
  return record.reviewRequired && isActiveStatus(record.status);
}

function isProtectedVisibility(value: string) {
  return value === "traveler_password" || value === "maker_only";
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
  const time = value?.trim();

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

function formatDayLabel(date: string, dayNumber: number) {
  return `Day ${dayNumber} · ${formatDate(date, false) || date}`;
}

function titleForDay(records: StructuredTripRecords, day: StructuredTripRecords["days"][number]) {
  const primaryLeg = records.legs.find((leg) => leg.id === day.primaryLegId);

  if (primaryLeg?.displayName) {
    return primaryLeg.displayName;
  }

  return day.title;
}

function createTransportEntry(
  item: StructuredTripRecords["transport"][number]
): GeneratedTripSummaryDayEntry {
  return {
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
    meta: item.transportType.replaceAll("_", " "),
    needsReview: item.reviewRequired,
    title: item.routeLabel,
  };
}

function createStayEntriesForDay(
  stay: StructuredTripRecords["stays"][number],
  date: string
): GeneratedTripSummaryDayEntry[] {
  const entries: GeneratedTripSummaryDayEntry[] = [];
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
      detail: addressDetail,
      id: `${stay.id}-staying-${date}`,
      kind: "stay",
      meta:
        stay.checkInDate === date
          ? [stay.checkInTime, "Check-in"].filter(Boolean).join(" · ")
          : "Stay",
      needsReview: stay.reviewRequired,
      title: `Staying: ${stay.name}`,
    });
  }

  return entries;
}

function createActivityEntry(
  item: StructuredTripRecords["items"][number],
  categoryById: Map<string, StructuredTripRecords["categories"][number]>
): GeneratedTripSummaryDayEntry {
  const category = categoryById.get(item.categoryId);

  return {
    detail: item.description ?? item.locationName ?? item.address ?? undefined,
    id: item.id,
    kind: item.reviewRequired ? "review" : "activity",
    meta: [formatTime(item.startTime), category?.label].filter(Boolean).join(" · "),
    needsReview: item.reviewRequired,
    title: item.title,
  };
}

function isLegLevelTip(item: StructuredTripRecords["items"][number]) {
  const text = [item.title, item.description].filter(Boolean).join(" ");

  return (
    item.itemType === "note" &&
    Boolean(item.legId) &&
    /\b(notes?\s*&\s*tips?|tips?|ideas?|recommendations?|also noted|possible sights?|local notes?|where to eat|food list|restaurants?|cafes?|bars?)\b/i.test(
      text
    )
  );
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
  const datedItems = activeItems.filter((item) => item.date);
  const undatedItems = activeItems.filter(
    (item) => !item.date && !isLegLevelTip(item)
  );

  const days = records.days
    .filter((day) => day.date !== "needs-placement")
    .map((day) => {
      const entries = [
        ...activeTransport
          .filter((item) => item.date === day.date)
          .map(createTransportEntry),
        ...activeStays.flatMap((stay) => createStayEntriesForDay(stay, day.date)),
        ...datedItems
          .filter((item) => item.date === day.date)
          .map((item) => createActivityEntry(item, categoryById)),
      ];

      return {
        date: day.date,
        entries,
        id: day.id,
        label: formatDayLabel(day.date, day.dayNumber),
        needsReview: day.reviewRequired || entries.some((entry) => entry.needsReview),
        title: titleForDay(records, day),
      };
    })
    .filter((day) => day.entries.length > 0);

  if (undatedItems.length > 0) {
    days.push({
      date: "needs-placement",
      entries: undatedItems.map((item) => createActivityEntry(item, categoryById)),
      id: `${records.trip.id}-needs-placement`,
      label: "Needs placement",
      needsReview: true,
      title: "Cards without a date",
    });
  }

  return days;
}

function createReviewItems(
  records: StructuredTripRecords
): GeneratedTripSummaryItem[] {
  const items: GeneratedTripSummaryItem[] = [];
  const openQuestions = records.reviewQuestions.filter(
    (question) => question.status === "open"
  );
  const privacyReviewCount = records.privateDetails.filter(
    (detail) => detail.reviewRequired
  ).length;
  const recordReviewBuckets = [
    {
      count: records.legs.filter(needsRecordReview).length,
      title: "Trip spine records need review",
    },
    {
      count: records.stays.filter(needsRecordReview).length,
      title: "Stay records need review",
    },
    {
      count: records.transport.filter(needsRecordReview).length,
      title: "Transport records need review",
    },
    {
      count: records.items.filter(needsRecordReview).length,
      title: "Activity records need review",
    },
  ].filter((bucket) => bucket.count > 0);

  if (privacyReviewCount > 0) {
    items.push({
      detail:
        privacyReviewCount === 1
          ? "1 sensitive detail needs a publish/privacy decision."
          : `${privacyReviewCount} sensitive details roll up into one privacy recommendation.`,
      meta: "Privacy",
      title: "Privacy recommendation needs review",
    });
  }

  for (const bucket of recordReviewBuckets) {
    items.push({
      detail: "Open the review queue to confirm, edit, ignore, or protect these records.",
      meta: `${bucket.count} ${bucket.count === 1 ? "record" : "records"}`,
      title: bucket.title,
    });
  }

  return [
    ...items,
    ...openQuestions.map((question) => ({
      detail: question.reason,
      meta: question.targetField ?? question.subjectType,
      title: question.prompt,
    })),
  ];
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
  const review = getStructuredReviewCount(records);
  const days = createSummaryDays(records, activeItems);

  return {
    counts: {
      activities: activeItems.filter((item) => item.itemType === "activity").length,
      places: records.legs.filter((leg) => isActiveStatus(leg.status)).length,
      plans: countTimelinePlans(days),
      privateDetails: records.privateDetails.filter((detail) =>
        isProtectedVisibility(detail.visibility)
      ).length,
      foodAndDining: activeItems.filter((item) => item.categoryId === "food_dining")
        .length,
      review,
      stays: records.stays.filter((stay) => isActiveStatus(stay.status)).length,
      transport: records.transport.filter((item) => isActiveStatus(item.status))
        .length,
    },
    dateRange: formatDateRange(records),
    days,
    destination: formatDestination(records),
    sections: createSummarySections(records, activeItems, review),
    isReadyForPublishReview: review === 0,
    title: records.trip.travelerAppTitle,
  };
}
