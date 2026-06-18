import type { StructuredTripRecords } from "@/lib/generated-trip-model";

export type StructuredReviewTone = "question" | "sensitive" | "warning";

export type StructuredReviewItem = {
  detail: string;
  id: string;
  meta: string;
  title: string;
  tone: StructuredReviewTone;
};

export type StructuredReviewSection = {
  count: number;
  description: string;
  emptyDetail: string;
  id: string;
  items: StructuredReviewItem[];
  title: string;
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getStructuredReviewCount(records: StructuredTripRecords | null) {
  if (!records) {
    return 0;
  }

  return (
    records.reviewQuestions.length +
    records.privateDetails.filter((detail) => detail.reviewRequired).length +
    records.legs.filter((leg) => leg.reviewRequired).length +
    records.stays.filter((stay) => stay.reviewRequired).length +
    records.transport.filter((item) => item.reviewRequired).length +
    records.items.filter((item) => item.reviewRequired).length
  );
}

export function getStructuredFoundParts(records: StructuredTripRecords | null) {
  if (!records) {
    return [];
  }

  const flights = records.transport.filter(
    (item) => item.transportType === "flight"
  ).length;
  const otherTransport = records.transport.length - flights;
  const restaurants = records.items.filter(
    (item) => item.itemType === "restaurant"
  ).length;
  const activities = records.items.filter(
    (item) => item.itemType === "activity"
  ).length;

  return [
    flights ? pluralize(flights, "flight") : null,
    otherTransport ? pluralize(otherTransport, "transport item") : null,
    records.stays.length ? pluralize(records.stays.length, "stay") : null,
    restaurants ? pluralize(restaurants, "restaurant") : null,
    activities ? pluralize(activities, "activity", "activities") : null,
  ].filter(Boolean);
}

export function formatStructuredDiscoverySummary(
  records: StructuredTripRecords | null,
  reviewCount = getStructuredReviewCount(records)
) {
  if (!records) {
    return null;
  }

  const tripSpan =
    records.legs.length > 0 && records.days.length > 0
      ? `${pluralize(records.legs.length, "leg")} across ${pluralize(records.days.length, "day")}`
      : records.days.length > 0
        ? pluralize(records.days.length, "day")
        : records.legs.length > 0
          ? pluralize(records.legs.length, "leg")
          : null;
  const foundParts = getStructuredFoundParts(records);
  const foundText = tripSpan
    ? `We found ${tripSpan}${foundParts.length > 0 ? `, including ${foundParts.join(", ")}` : ""}.`
    : foundParts.length > 0
      ? `We found ${foundParts.join(", ")}.`
      : "We found a parsed trip draft.";
  const reviewText =
    reviewCount > 0
      ? `We need you to confirm ${pluralize(reviewCount, "thing")} before this becomes the traveler app.`
      : "Nothing needs confirmation before this becomes the traveler app.";

  return `${foundText} ${reviewText}`;
}

export function getStructuredReviewSections(
  records: StructuredTripRecords
): StructuredReviewSection[] {
  return [
    {
      count: records.legs.length,
      description: "Route spine, dates, cities, languages, and map/weather anchors.",
      emptyDetail: "No route questions found.",
      id: "places",
      items: records.legs
        .filter((leg) => leg.reviewRequired)
        .map((leg) => ({
          detail:
            leg.summary ??
            "This place is missing a route-spine detail needed for the traveler app.",
          id: leg.id,
          meta: [leg.arriveDate, leg.leaveDate].filter(Boolean).join(" to "),
          title: leg.displayName,
          tone: "warning" as const,
        })),
      title: "Places",
    },
    {
      count: records.stays.length,
      description: "Lodging records with dates, public labels, addresses, and access privacy.",
      emptyDetail: "Stay records look usable for this draft.",
      id: "stays",
      items: records.stays
        .filter((stay) => stay.reviewRequired)
        .map((stay) => ({
          detail:
            "This stay needs enough check-in or location detail to support the Stay tool.",
          id: stay.id,
          meta: [stay.checkInDate, stay.checkOutDate].filter(Boolean).join(" to "),
          title: stay.name,
          tone: "warning" as const,
        })),
      title: "Stays",
    },
    {
      count: records.transport.length,
      description: "Flights, trains, transfers, drives, and other critical movement.",
      emptyDetail: "Transport records look usable for this draft.",
      id: "transport",
      items: records.transport
        .filter((item) => item.reviewRequired)
        .map((item) => ({
          detail:
            item.description ??
            "This transport record needs a date or route detail before it can be placed cleanly.",
          id: item.id,
          meta: item.transportType,
          title: item.routeLabel,
          tone: "warning" as const,
        })),
      title: "Transport",
    },
    {
      count: records.items.length,
      description: "Activities, restaurants, notes, rest days, and other traveler cards.",
      emptyDetail: "Traveler cards look usable for this draft.",
      id: "cards",
      items: records.items
        .filter((item) => item.reviewRequired)
        .map((item) => ({
          detail:
            item.description ??
            "This card needs a date or enough detail to place it in the traveler app.",
          id: item.id,
          meta: item.itemType,
          title: item.title,
          tone: "warning" as const,
        })),
      title: "Cards",
    },
    {
      count: records.privateDetails.length,
      description: "Sensitive addresses, confirmations, access notes, and private details.",
      emptyDetail: "Private details have default protection decisions.",
      id: "private-details",
      items: records.privateDetails
        .filter((detail) => detail.reviewRequired)
        .map((detail) => ({
          detail:
            detail.reason ??
            "This private detail should be reviewed before the app is shared.",
          id: detail.id,
          meta: detail.detailType,
          title: detail.label,
          tone: "sensitive" as const,
        })),
      title: "Private details",
    },
    {
      count: records.reviewQuestions.length,
      description: "Generated questions that materially affect the traveler app.",
      emptyDetail: "No missing-detail questions found.",
      id: "questions",
      items: records.reviewQuestions.map((question) => ({
        detail: question.reason,
        id: question.id,
        meta: "Missing detail",
        title: question.prompt,
        tone: "question" as const,
      })),
      title: "Questions",
    },
  ];
}
