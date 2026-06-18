import type {
  StructuredTripRecords,
  TripRecordStatus,
} from "@/lib/generated-trip-model";
import { getStructuredReviewCount } from "@/lib/generated-trip-review";

export type GeneratedTripSummaryView = {
  counts: {
    activities: number;
    places: number;
    privateDetails: number;
    restaurants: number;
    review: number;
    stays: number;
    transport: number;
  };
  dateRange: string;
  destination: string;
  isReadyForPublishReview: boolean;
  title: string;
};

function isActiveStatus(status: TripRecordStatus) {
  return status !== "ignored";
}

function formatDateRange(records: StructuredTripRecords) {
  const dates = records.days
    .map((day) => day.date)
    .filter((date) => date !== "needs-placement")
    .sort();

  if (records.trip.startDate && records.trip.endDate) {
    return `${records.trip.startDate} to ${records.trip.endDate}`;
  }

  if (dates.length > 1) {
    return `${dates[0]} to ${dates.at(-1)}`;
  }

  if (dates.length === 1) {
    return dates[0] ?? "Dates to confirm";
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

export function createGeneratedTripSummaryView(
  records: StructuredTripRecords
): GeneratedTripSummaryView {
  const activeItems = records.items.filter((item) => isActiveStatus(item.status));
  const review = getStructuredReviewCount(records);

  return {
    counts: {
      activities: activeItems.filter((item) => item.itemType === "activity").length,
      places: records.legs.filter((leg) => isActiveStatus(leg.status)).length,
      privateDetails: records.privateDetails.filter(
        (detail) => detail.visibility !== "hidden"
      ).length,
      restaurants: activeItems.filter((item) => item.itemType === "restaurant")
        .length,
      review,
      stays: records.stays.filter((stay) => isActiveStatus(stay.status)).length,
      transport: records.transport.filter((item) => isActiveStatus(item.status))
        .length,
    },
    dateRange: formatDateRange(records),
    destination: formatDestination(records),
    isReadyForPublishReview: review === 0,
    title: records.trip.travelerAppTitle,
  };
}
