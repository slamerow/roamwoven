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

export type GeneratedTripSummaryView = {
  counts: {
    activities: number;
    places: number;
    privateDetails: number;
    foodAndDining: number;
    review: number;
    stays: number;
    transport: number;
  };
  dateRange: string;
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
  return value?.trim() ?? "";
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

export function createGeneratedTripSummaryView(
  records: StructuredTripRecords
): GeneratedTripSummaryView {
  const activeItems = records.items.filter((item) => isActiveStatus(item.status));
  const review = getStructuredReviewCount(records);

  return {
    counts: {
      activities: activeItems.filter((item) => item.itemType === "activity").length,
      places: records.legs.filter((leg) => isActiveStatus(leg.status)).length,
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
    destination: formatDestination(records),
    sections: createSummarySections(records, activeItems, review),
    isReadyForPublishReview: review === 0,
    title: records.trip.travelerAppTitle,
  };
}
