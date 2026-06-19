import type { ReviewDecisionSubjectType } from "@/lib/generated-trip-decisions";
import type {
  StructuredTripRecords,
  TripRecordStatus,
} from "@/lib/generated-trip-model";

export type StructuredReviewTone = "question" | "sensitive" | "warning";

export type StructuredReviewEditField = {
  helpText?: string;
  label: string;
  name: string;
  options?: Array<{ label: string; value: string }>;
  type: "date" | "select" | "text" | "textarea" | "time" | "url";
  value: string;
};

export type StructuredReviewCombineOption = {
  label: string;
  value: string;
};

export type StructuredReviewItem = {
  combineOptions: StructuredReviewCombineOption[];
  detail: string;
  editFields: StructuredReviewEditField[];
  id: string;
  meta: string;
  subjectId: string;
  subjectType: ReviewDecisionSubjectType;
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

function isActiveStatus(status: TripRecordStatus) {
  return status !== "ignored";
}

function needsRecordReview(record: { reviewRequired: boolean; status: TripRecordStatus }) {
  return record.reviewRequired && isActiveStatus(record.status);
}

function isOpenQuestion(question: StructuredTripRecords["reviewQuestions"][number]) {
  return question.status === "open";
}

function itemCombineOptions({
  currentItemId,
  records,
}: {
  currentItemId: string;
  records: StructuredTripRecords;
}): StructuredReviewCombineOption[] {
  return records.items
    .filter((item) => item.id !== currentItemId && isActiveStatus(item.status))
    .map((item) => ({
      label: item.date ? `${item.title} (${item.date})` : item.title,
      value: item.id,
    }));
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
  options?: Array<{ label: string; value: string }>;
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

const itemTypeOptions = [
  { label: "Activity", value: "activity" },
  { label: "Restaurant", value: "restaurant" },
  { label: "Note", value: "note" },
  { label: "Admin", value: "admin" },
  { label: "Rest day", value: "rest_day" },
  { label: "Social", value: "social" },
  { label: "Placeholder", value: "placeholder" },
];

const visibilityOptions = [
  { label: "Public", value: "public" },
  { label: "Traveler password", value: "traveler_password" },
  { label: "Maker only", value: "maker_only" },
  { label: "Hidden", value: "hidden" },
];

export function getStructuredReviewCount(records: StructuredTripRecords | null) {
  if (!records) {
    return 0;
  }

  return (
    records.reviewQuestions.filter(isOpenQuestion).length +
    records.privateDetails.filter((detail) => detail.reviewRequired).length +
    records.legs.filter(needsRecordReview).length +
    records.stays.filter(needsRecordReview).length +
    records.transport.filter(needsRecordReview).length +
    records.items.filter(needsRecordReview).length
  );
}

export function getStructuredFoundParts(records: StructuredTripRecords | null) {
  if (!records) {
    return [];
  }

  const flights = records.transport.filter(
    (item) => item.transportType === "flight"
  ).length;
  const restaurants = records.items.filter(
    (item) => item.itemType === "restaurant"
  ).length;
  const activities = records.items.filter(
    (item) => item.itemType === "activity"
  ).length;

  return [
    records.transport.length
      ? `${pluralize(records.transport.length, "transport item")}${
          flights ? ` (${pluralize(flights, "flight")})` : ""
        }`
      : null,
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
      count: records.legs.filter((leg) => isActiveStatus(leg.status)).length,
      description: "Route spine, dates, cities, languages, and map/weather anchors.",
      emptyDetail: "No route questions found.",
      id: "places",
      items: records.legs
        .filter(needsRecordReview)
        .map((leg) => ({
          combineOptions: [],
          detail:
            leg.summary ??
            "This place is missing a route-spine detail needed for the traveler app.",
          editFields: [
            field({ label: "City", name: "city", value: leg.city }),
            field({ label: "Country", name: "country", value: leg.country }),
            field({
              label: "Arrive date",
              name: "arriveDate",
              type: "date",
              value: leg.arriveDate,
            }),
            field({
              label: "Leave date",
              name: "leaveDate",
              type: "date",
              value: leg.leaveDate,
            }),
            field({ label: "Timezone", name: "timezone", value: leg.timezone }),
            field({ label: "Language", name: "language", value: leg.language }),
            field({
              label: "Summary",
              name: "summary",
              type: "textarea",
              value: leg.summary,
            }),
          ],
          id: leg.id,
          meta: [leg.arriveDate, leg.leaveDate].filter(Boolean).join(" to "),
          subjectId: leg.id,
          subjectType: "leg" as const,
          title: leg.displayName,
          tone: "warning" as const,
        })),
      title: "Places",
    },
    {
      count: records.stays.filter((stay) => isActiveStatus(stay.status)).length,
      description: "Lodging records with dates, public labels, addresses, and access privacy.",
      emptyDetail: "Stay records look usable for this draft.",
      id: "stays",
      items: records.stays
        .filter(needsRecordReview)
        .map((stay) => ({
          combineOptions: [],
          detail:
            "This stay needs enough check-in or location detail to support the Stay tool.",
          editFields: [
            field({ label: "Stay name", name: "name", value: stay.name }),
            field({
              label: "Check-in date",
              name: "checkInDate",
              type: "date",
              value: stay.checkInDate,
            }),
            field({
              label: "Check-out date",
              name: "checkOutDate",
              type: "date",
              value: stay.checkOutDate,
            }),
            field({
              label: "Public location",
              name: "publicLocationLabel",
              value: stay.publicLocationLabel,
            }),
            field({
              helpText: "Exact private addresses should usually be protected.",
              label: "Address",
              name: "address",
              value: stay.address,
            }),
            field({
              label: "Address visibility",
              name: "addressVisibility",
              options: visibilityOptions,
              type: "select",
              value: stay.addressVisibility,
            }),
          ],
          id: stay.id,
          meta: [stay.checkInDate, stay.checkOutDate].filter(Boolean).join(" to "),
          subjectId: stay.id,
          subjectType: "stay" as const,
          title: stay.name,
          tone: "warning" as const,
        })),
      title: "Stays",
    },
    {
      count: records.transport.filter((item) => isActiveStatus(item.status)).length,
      description: "Flights, trains, transfers, drives, and other critical movement.",
      emptyDetail: "Transport records look usable for this draft.",
      id: "transport",
      items: records.transport
        .filter(needsRecordReview)
        .map((item) => ({
          combineOptions: [],
          detail:
            item.description ??
            "This transport record needs a date or route detail before it can be placed cleanly.",
          editFields: [
            field({ label: "Route label", name: "routeLabel", value: item.routeLabel }),
            field({
              label: "Transport type",
              name: "transportType",
              options: [
                { label: "Flight", value: "flight" },
                { label: "Train", value: "train" },
                { label: "Ferry", value: "ferry" },
                { label: "Rental car", value: "rental_car" },
                { label: "Transfer", value: "transfer" },
                { label: "Bus", value: "bus" },
                { label: "Drive", value: "drive" },
                { label: "Other", value: "other" },
              ],
              type: "select",
              value: item.transportType,
            }),
            field({ label: "Date", name: "date", type: "date", value: item.date }),
            field({
              label: "Departure time",
              name: "departureTime",
              type: "time",
              value: item.departureTime,
            }),
            field({
              label: "Arrival time",
              name: "arrivalTime",
              type: "time",
              value: item.arrivalTime,
            }),
            field({ label: "Provider", name: "provider", value: item.provider }),
            field({
              label: "Description",
              name: "description",
              type: "textarea",
              value: item.description,
            }),
          ],
          id: item.id,
          meta: item.transportType,
          subjectId: item.id,
          subjectType: "transport" as const,
          title: item.routeLabel,
          tone: "warning" as const,
        })),
      title: "Transport",
    },
    {
      count: records.items.filter((item) => isActiveStatus(item.status)).length,
      description: "Activities, restaurants, notes, rest days, and other traveler cards.",
      emptyDetail: "Traveler cards look usable for this draft.",
      id: "cards",
      items: records.items
        .filter(needsRecordReview)
        .map((item) => ({
          combineOptions: itemCombineOptions({
            currentItemId: item.id,
            records,
          }),
          detail:
            item.description ??
            "This card needs a date or enough detail to place it in the traveler app.",
          editFields: [
            field({ label: "Title", name: "title", value: item.title }),
            field({
              label: "Card type",
              name: "itemType",
              options: itemTypeOptions,
              type: "select",
              value: item.itemType,
            }),
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
            field({
              label: "Location",
              name: "locationName",
              value: item.locationName,
            }),
            field({ label: "Address", name: "address", value: item.address }),
            field({ label: "URL", name: "url", type: "url", value: item.url }),
            field({
              label: "Description",
              name: "description",
              type: "textarea",
              value: item.description,
            }),
          ],
          id: item.id,
          meta: item.itemType,
          subjectId: item.id,
          subjectType: "item" as const,
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
          combineOptions: [],
          detail:
            detail.reason ??
            "This private detail should be reviewed before the app is shared.",
          editFields: [
            field({ label: "Label", name: "label", value: detail.label }),
            field({ label: "Detail type", name: "detailType", value: detail.detailType }),
            field({
              label: "Private value",
              name: "value",
              type: "textarea",
              value: detail.value,
            }),
            field({
              label: "Visibility",
              name: "visibility",
              options: visibilityOptions,
              type: "select",
              value: detail.visibility,
            }),
            field({
              label: "Reason",
              name: "reason",
              type: "textarea",
              value: detail.reason,
            }),
          ],
          id: detail.id,
          meta: detail.detailType,
          subjectId: detail.id,
          subjectType: "private_detail" as const,
          title: detail.label,
          tone: "sensitive" as const,
        })),
      title: "Private details",
    },
    {
      count: records.reviewQuestions.filter(isOpenQuestion).length,
      description: "Generated questions that materially affect the traveler app.",
      emptyDetail: "No missing-detail questions found.",
      id: "questions",
      items: records.reviewQuestions.filter(isOpenQuestion).map((question) => ({
        combineOptions: [],
        detail: question.reason,
        editFields: [],
        id: question.id,
        meta: "Missing detail",
        subjectId: question.id,
        subjectType: "review_question" as const,
        title: question.prompt,
        tone: "question" as const,
      })),
      title: "Questions",
    },
  ];
}
