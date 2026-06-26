import type { ReviewDecisionSubjectType } from "@/lib/generated-trip-decisions";
import type {
  StructuredTripRecords,
  TripRecordStatus,
} from "@/lib/generated-trip-model";
import { getTripCategoryLabel } from "@/lib/trip-categories";

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
  answerType?: StructuredTripRecords["reviewQuestions"][number]["answerType"];
  childItems?: Array<{
    detail: string;
    id: string;
    meta: string;
    title: string;
  }>;
  combineOptions: StructuredReviewCombineOption[];
  detail: string;
  editFields: StructuredReviewEditField[];
  id: string;
  meta: string;
  subjectId: string;
  subjectIds?: string[];
  subjectType: ReviewDecisionSubjectType;
  suggestedAnswer?: string | null;
  suggestedAnswerLabel?: string;
  title: string;
  tone: StructuredReviewTone;
};

export type StructuredReviewSection = {
  count: number;
  description: string;
  emptyDetail: string;
  id: string;
  items: StructuredReviewItem[];
  summaryItems: string[];
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

function isCityTipItem(item: StructuredTripRecords["items"][number]) {
  const text = [item.title, item.description].filter(Boolean).join(" ");
  const daySpecificCluster =
    /\b(first[-\s]?day|second[-\s]?day|third[-\s]?day|day \d+|for the .* day|morning|afternoon|evening)\b/i.test(
      text
    );
  const genericTipHeader =
    /\b(notes?\s*&\s*tips?|eat\s*:|food\s*:|drinks?\s*&\s*nightlife\s*:|possible sights?\s*:|local notes?\s*:|bars?\s*:|beer halls?\s*:|cafes?\s*:|restaurants?\s*:|shopping\s*:|also noted|where to eat|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls to consider|check out foods like|good beer halls|beer halls are|food options|drink options|shopping ideas|local tips?)\b/i.test(
      text
    );

  if (
    daySpecificCluster &&
    !genericTipHeader &&
    item.categoryId !== "food_dining" &&
    item.categoryId !== "shopping_tailor"
  ) {
    return false;
  }

  return (
    item.itemType === "note" &&
    Boolean(item.legId) &&
    /\b(notes?\s*&\s*tips?|tips?|ideas?|recommendations?|also noted|eat\s*:|food\s*:|drinks?\s*&\s*nightlife\s*:|possible sights?\s*:|bars?\s*:|beer halls?\s*:|cafes?\s*:|restaurants?\s*:|shopping\s*:|where to eat|food list|restaurants?|cafes?|bars?|beer halls?|check out foods like|food options|drink options|shopping ideas|local notes?)\b/i.test(
      text
    )
  );
}

function getReviewActivityItems(records: StructuredTripRecords) {
  return records.items.filter(
    (item) => isActiveStatus(item.status) && !isCityTipItem(item)
  );
}

function getCityTipItems(records: StructuredTripRecords) {
  return records.items.filter(
    (item) => isActiveStatus(item.status) && isCityTipItem(item)
  );
}

function isOpenQuestion(question: StructuredTripRecords["reviewQuestions"][number]) {
  return question.status === "open";
}

function isNotedQuestion(question: StructuredTripRecords["reviewQuestions"][number]) {
  return question.status === "noted";
}

function getSuggestedAnswerLabel(
  question: StructuredTripRecords["reviewQuestions"][number]
) {
  const guessed = question.guessedValue?.toLowerCase() ?? "";

  if (
    /\b(tbd|not sure|not decided|haven't decided|have not decided|undecided)\b/.test(
      guessed
    )
  ) {
    return "I haven't decided yet";
  }

  if (question.answerType === "date") {
    return "Use this date";
  }

  if (question.answerType === "time") {
    return "Use this time";
  }

  if (question.answerType === "visibility") {
    return "Use this privacy setting";
  }

  return "Use suggested answer";
}

function formatCallTitle(prompt: string) {
  return prompt
    .replace(/\s+Is that right\?$/i, ".")
    .replace(/^This looks like the (.+?) starting /i, "We treated the $1 as starting ")
    .replace(/^This looks like /i, "We treated ")
    .replace(/\?$/g, ".")
    .replace(/\.{2,}$/g, ".");
}

function itemCombineOptions({
  currentItemId,
  records,
}: {
  currentItemId: string;
  records: StructuredTripRecords;
}): StructuredReviewCombineOption[] {
  const currentItem = records.items.find((item) => item.id === currentItemId);

  if (!currentItem) {
    return [];
  }

  const currentTitle = normalizeComparableText(currentItem.title);

  return records.items
    .filter((item) => {
      if (item.id === currentItemId || !isActiveStatus(item.status)) {
        return false;
      }

      if (item.categoryId !== currentItem.categoryId || item.date !== currentItem.date) {
        return false;
      }

      const title = normalizeComparableText(item.title);
      return (
        currentTitle.includes(title) ||
        title.includes(currentTitle) ||
        hasMeaningfulTokenOverlap(currentTitle, title)
      );
    })
    .map((item) => ({
      label: item.date ? `${item.title} (${item.date})` : item.title,
      value: item.id,
    }));
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasMeaningfulTokenOverlap(first: string, second: string) {
  const stopWords = new Set(["and", "the", "a", "an", "to", "of", "in", "at"]);
  const firstTokens = new Set(
    first.split(" ").filter((token) => token.length > 3 && !stopWords.has(token))
  );
  const secondTokens = second
    .split(" ")
    .filter((token) => token.length > 3 && !stopWords.has(token));

  return secondTokens.some((token) => firstTokens.has(token));
}

function normalizeQuestionTargetField(
  subjectType: StructuredTripRecords["reviewQuestions"][number]["subjectType"],
  targetField: string | null
) {
  const rawField = targetField?.split("/").pop() ?? targetField;

  if (!rawField) {
    return null;
  }

  if (subjectType === "stay") {
    if (rawField === "title") {
      return "name";
    }

    if (rawField === "checkIn") {
      return "checkInDate";
    }

    if (rawField === "checkOut") {
      return "checkOutDate";
    }
  }

  return rawField;
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

function getFieldValue(record: Record<string, unknown>, name: string) {
  const value = record[name];
  return typeof value === "string" ? value : "";
}

function editFieldForRecord({
  name,
  record,
}: {
  name: string;
  record: Record<string, unknown>;
}) {
  const dateFields = new Set(["arriveDate", "checkInDate", "checkOutDate", "date", "leaveDate"]);
  const timeFields = new Set(["arrivalTime", "departureTime", "endTime", "startTime"]);
  const textareaFields = new Set(["description", "summary"]);
  const label = name
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  if (name === "addressVisibility") {
    return field({
      label,
      name,
      options: visibilityOptions,
      type: "select",
      value: getFieldValue(record, name),
    });
  }

  return field({
    label,
    name,
    type: dateFields.has(name)
      ? "date"
      : timeFields.has(name)
        ? "time"
        : textareaFields.has(name)
          ? "textarea"
          : "text",
    value: getFieldValue(record, name),
  });
}

function noteEditFieldsForQuestion({
  question,
  records,
}: {
  question: StructuredTripRecords["reviewQuestions"][number];
  records: StructuredTripRecords;
}) {
  if (!question.subjectId) {
    return [];
  }

  const targetField = normalizeQuestionTargetField(
    question.subjectType,
    question.targetField
  );

  if (question.subjectType === "stay") {
    const stay = records.stays.find((item) => item.id === question.subjectId);

    if (!stay) {
      return [];
    }

    const fields = targetField
      ? [targetField]
      : ["name", "checkInDate", "checkOutDate", "publicLocationLabel"];

    return fields
      .filter((name) => name in stay)
      .map((name) => editFieldForRecord({ name, record: stay as unknown as Record<string, unknown> }));
  }

  if (question.subjectType === "transport") {
    const transport = records.transport.find(
      (item) => item.id === question.subjectId
    );

    if (!transport) {
      return [];
    }

    const fields = targetField
      ? [targetField]
      : ["routeLabel", "date", "departureTime", "arrivalTime"];

    return fields
      .filter((name) => name in transport)
      .map((name) => editFieldForRecord({ name, record: transport as unknown as Record<string, unknown> }));
  }

  if (question.subjectType === "item") {
    const item = records.items.find((record) => record.id === question.subjectId);

    if (!item) {
      return [];
    }

    const fields = targetField
      ? [targetField]
      : ["title", "date", "startTime", "locationName"];

    return fields
      .filter((name) => name in item)
      .map((name) => editFieldForRecord({ name, record: item as unknown as Record<string, unknown> }));
  }

  if (question.subjectType === "leg") {
    const leg = records.legs.find((item) => item.id === question.subjectId);

    if (!leg) {
      return [];
    }

    const fields = targetField
      ? [targetField]
      : ["city", "arriveDate", "leaveDate"];

    return fields
      .filter((name) => name in leg)
      .map((name) => editFieldForRecord({ name, record: leg as unknown as Record<string, unknown> }));
  }

  return [];
}

function parseReviewDate(value: string | null) {
  if (!value) {
    return null;
  }

  const dateOnly = value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? value;
  const date = new Date(`${dateOnly}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatReviewDate(value: string | null, includeYear = true) {
  const date = parseReviewDate(value);

  if (!date) {
    return value?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? value;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function formatReviewDateRange(start: string | null, end: string | null) {
  const startDate = parseReviewDate(start);
  const endDate = parseReviewDate(end);
  const formattedStart = formatReviewDate(start, true);
  const formattedEnd = formatReviewDate(end, true);

  if (!start && !end) {
    return "";
  }

  if (!startDate || !endDate || start === end) {
    return formattedStart ?? formattedEnd ?? "";
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
    return `${formatReviewDate(start, false)}-${formatReviewDate(end, true)}`;
  }

  return `${formattedStart}-${formattedEnd}`;
}

function formatReviewDateValue(value: string | null) {
  return formatReviewDate(value, true) ?? "";
}

function getPrivacyGroup(detailType: string) {
  const normalized = detailType.toLowerCase();

  if (
    normalized.includes("confirmation") ||
    normalized.includes("booking") ||
    normalized.includes("ticket") ||
    normalized.includes("pnr")
  ) {
    return {
      id: "confirmations",
      title: "Confirmation and booking codes",
      detail:
        "Recommended: keep confirmation numbers, booking references, and ticket codes behind the trip password.",
    };
  }

  if (
    normalized.includes("access") ||
    normalized.includes("door") ||
    normalized.includes("gate") ||
    normalized.includes("wifi") ||
    normalized.includes("lock")
  ) {
    return {
      id: "access",
      title: "Access codes and arrival instructions",
      detail:
        "Recommended: keep door codes, Wi-Fi passwords, lockbox notes, and access instructions behind the trip password.",
    };
  }

  if (
    normalized.includes("address") ||
    normalized.includes("residence") ||
    normalized.includes("lodging")
  ) {
    return {
      id: "addresses",
      title: "Private stay addresses",
      detail:
        "Recommended: show hotel or hostel addresses publicly, but keep private rentals, homes, and access details behind the trip password.",
    };
  }

  return {
    id: "private-notes",
    title: "Sensitive personal details",
    detail:
      "Recommended: keep host contact info, ID/payment details, medical or safety notes, emergency contacts, and explicitly private notes behind the trip password.",
  };
}

function getPrivacyRecommendationDetail() {
  return "Recommended: keep private rental addresses, access codes, Wi-Fi passwords, booking references, room or access details, and sensitive personal details behind the trip password. Hotels, hostels, restaurants, shops, museums, stations, and public venues stay visible.";
}

function normalizePrivacyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(check into|check in at|sleep at|stay at|staying at)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getPrivacyDetailLabel(detailType: string) {
  return getPrivacyGroup(detailType).title;
}

const itemTypeOptions = [
  { label: "Activity", value: "activity" },
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

  const privacyReviewCount = records.privateDetails.some(
    (detail) => detail.reviewRequired
  )
    ? 1
    : 0;

  return (
    records.reviewQuestions.filter(isOpenQuestion).length +
    privacyReviewCount +
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
  const activityItems = getReviewActivityItems(records);
  const foodAndDining = activityItems.filter(
    (item) => item.categoryId === "food_dining"
  ).length;
  const activities = activityItems.length;
  const cityTips = getCityTipItems(records).length;

  return [
    records.transport.length
      ? `${pluralize(records.transport.length, "transport item")}${
          flights ? ` (${pluralize(flights, "flight")})` : ""
        }`
      : null,
    records.stays.length ? pluralize(records.stays.length, "stay") : null,
    activities
      ? `${pluralize(activities, "activity", "activities")}${
          foodAndDining ? ` (${pluralize(foodAndDining, "food and dining")})` : ""
        }`
      : null,
    cityTips ? pluralize(cityTips, "city note/tip", "city notes/tips") : null,
  ].filter(Boolean);
}

export function getStructuredScannedParts(records: StructuredTripRecords | null) {
  if (!records) {
    return [];
  }

  const activityItems = getReviewActivityItems(records);
  const foodAndDining = activityItems.filter(
    (item) => item.categoryId === "food_dining"
  ).length;
  const activities = activityItems.length;
  const cityTips = getCityTipItems(records).length;

  return [
    records.legs.length ? pluralize(records.legs.length, "leg") : null,
    records.transport.length
      ? pluralize(records.transport.length, "transport item")
      : null,
    records.stays.length ? pluralize(records.stays.length, "stay") : null,
    activities
      ? `${pluralize(activities, "activity", "activities")}${
          foodAndDining ? ` (${pluralize(foodAndDining, "food and dining")})` : ""
        }`
      : null,
    cityTips ? pluralize(cityTips, "city note/tip", "city notes/tips") : null,
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
  const privacySubjectIds: string[] = [];
  const privacySpecifics = new Map<
    string,
    {
      detail: string;
      id: string;
      meta: string;
      title: string;
    }
  >();

  records.privateDetails
    .filter((detail) => detail.reviewRequired)
    .forEach((detail) => {
      const group = getPrivacyGroup(detail.detailType);
      const normalizedLabel = normalizePrivacyLabel(detail.label);
      const dedupeKey = `${group.id}:${normalizedLabel || detail.detailType}`;

      privacySubjectIds.push(detail.id);

      if (!privacySpecifics.has(dedupeKey)) {
        privacySpecifics.set(dedupeKey, {
          detail:
            detail.reason ??
            "This private detail should be reviewed before the app is shared.",
          id: `privacy-specific-${privacySpecifics.size + 1}`,
          meta: getPrivacyDetailLabel(detail.detailType),
          title: detail.label,
        });
        return;
      }

      const existing = privacySpecifics.get(dedupeKey);

      if (existing && detail.reason && !existing.detail.includes(detail.reason)) {
        privacySpecifics.set(dedupeKey, {
          ...existing,
          detail: `${existing.detail} ${detail.reason}`,
        });
      }
    });

  const privacyItems: StructuredReviewItem[] =
    privacySubjectIds.length > 0
      ? [
        {
          childItems: Array.from(privacySpecifics.values()),
          combineOptions: [],
          detail: getPrivacyRecommendationDetail(),
          editFields: [],
          id: "privacy-recommendation",
          meta: pluralize(privacySubjectIds.length, "detail"),
          subjectId: privacySubjectIds[0] ?? "privacy-recommendation",
          subjectIds: privacySubjectIds,
          subjectType: "private_detail" as const,
          title: "Confirm recommended privacy",
          tone: "sensitive" as const,
        },
      ]
      : [];
  const categoryOptions = records.categories.map((category) => ({
    label: category.label,
    value: category.id,
  }));
  const legOptions = records.legs
    .filter((leg) => isActiveStatus(leg.status))
    .map((leg) => ({
      label: [leg.displayName, leg.country].filter(Boolean).join(", "),
      value: leg.id,
    }));
  const legById = new Map(records.legs.map((leg) => [leg.id, leg]));
  const categoryById = new Map(
    records.categories.map((category) => [category.id, category])
  );
  const cityTipItems = getCityTipItems(records);

  return [
    {
      count: records.legs.filter((leg) => isActiveStatus(leg.status)).length,
      description: "Route spine, dates, cities, languages, and map/weather anchors.",
      emptyDetail: "No place decisions needed.",
      id: "legs",
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
          meta: formatReviewDateRange(leg.arriveDate, leg.leaveDate),
          subjectId: leg.id,
          subjectType: "leg" as const,
          title: leg.displayName,
          tone: "warning" as const,
        })),
      summaryItems: records.legs
        .filter((leg) => isActiveStatus(leg.status))
        .map((leg) =>
          [leg.displayName, formatReviewDateRange(leg.arriveDate, leg.leaveDate)]
            .filter(Boolean)
            .join(" · ")
        ),
      title: "Legs",
    },
    {
      count: records.stays.filter((stay) => isActiveStatus(stay.status)).length,
      description: "Lodging records with check-in, check-out, and stay privacy.",
      emptyDetail: "No stay decisions needed.",
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
          meta: formatReviewDateRange(stay.checkInDate, stay.checkOutDate),
          subjectId: stay.id,
          subjectType: "stay" as const,
          title: stay.name,
          tone: "warning" as const,
        })),
      summaryItems: records.stays
        .filter((stay) => isActiveStatus(stay.status))
        .map((stay) =>
          [
            stay.name,
            [
              stay.checkInDate
                ? `Check-in ${formatReviewDateValue(stay.checkInDate)}`
                : null,
              stay.checkOutDate
                ? `Check-out ${formatReviewDateValue(stay.checkOutDate)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          ]
            .filter(Boolean)
            .join("\n")
        ),
      title: "Stays",
    },
    {
      count: records.transport.filter((item) => isActiveStatus(item.status)).length,
      description: "Flights, trains, transfers, drives, and other critical movement.",
      emptyDetail: "No transport decisions needed.",
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
      summaryItems: records.transport
        .filter((item) => isActiveStatus(item.status))
        .map((item) =>
          [item.routeLabel, formatReviewDateValue(item.date)]
            .filter(Boolean)
            .join(" · ")
        ),
      title: "Transport",
    },
    {
      count: getReviewActivityItems(records).length,
      description: "Places, meals, events, logistics, and plans found in your materials.",
      emptyDetail: "No activity decisions needed.",
      id: "activities",
      items: records.items
        .filter((item) => needsRecordReview(item) && !isCityTipItem(item))
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
      summaryItems: records.categories
        .map((category) => {
          const items = getReviewActivityItems(records).filter(
            (item) => item.categoryId === category.id
          );

          if (items.length === 0) {
            return null;
          }

          return [
            `${category.emoji ?? "•"} ${category.label} · ${pluralize(
              items.length,
              "activity",
              "activities"
            )}`,
            ...items.map((item) => `  ${item.title}`),
          ].join("\n");
        })
        .filter((item): item is string => Boolean(item)),
      title: "Activities",
    },
    {
      count: cityTipItems.length,
      description: "City-level food ideas, local notes, loose travel notes, and tips grouped under Legs.",
      emptyDetail: "No city notes or tips found.",
      id: "city-tips",
      items: cityTipItems
        .filter(needsRecordReview)
        .map((item) => {
          const leg = item.legId ? legById.get(item.legId) : null;
          const category = categoryById.get(item.categoryId);

          return {
            combineOptions: [],
            detail:
              item.description ??
              "This city note needs enough context to place it under the right leg.",
            editFields: [
              field({ label: "Title", name: "title", value: item.title }),
              field({
                label: "City / leg",
                name: "legId",
                options: legOptions,
                type: "select",
                value: item.legId,
              }),
              field({
                label: "Category",
                name: "categoryId",
                options: categoryOptions,
                type: "select",
                value: item.categoryId,
              }),
              field({
                label: "Card type",
                name: "itemType",
                options: itemTypeOptions,
                type: "select",
                value: item.itemType,
              }),
              field({
                helpText:
                  "Only add a date if this should become a specific traveler activity.",
                label: "Activity date",
                name: "date",
                type: "date",
                value: item.date,
              }),
              field({
                label: "Description",
                name: "description",
                type: "textarea",
                value: item.description,
              }),
            ],
            id: item.id,
            meta: [
              leg?.displayName,
              category?.label ?? getTripCategoryLabel(item.categoryId),
            ]
              .filter(Boolean)
              .join(" · "),
            subjectId: item.id,
            subjectType: "item" as const,
            title: item.title,
            tone: "warning" as const,
          };
        }),
      summaryItems: cityTipItems.map((item) => {
        const leg = item.legId ? legById.get(item.legId) : null;
        const category = categoryById.get(item.categoryId);

        return [
          [leg?.displayName, item.title].filter(Boolean).join(" · "),
          category?.label ?? getTripCategoryLabel(item.categoryId),
          item.description,
        ]
          .filter(Boolean)
          .join("\n");
      }),
      title: "City notes & tips",
    },
    {
      count: records.reviewQuestions.filter(isNotedQuestion).length,
      description: "Reasonable itinerary calls Roamwoven made without needing a decision.",
      emptyDetail: "No extra calls to note.",
      id: "notes",
      items: records.reviewQuestions
        .filter(isNotedQuestion)
        .map((question) => {
          const editFields = noteEditFieldsForQuestion({ question, records });

          return {
            combineOptions: [],
            detail: [
              question.guessedValue
                ? `Used: ${question.guessedValue}`
                : null,
              question.reason,
              question.evidence ? `Evidence: ${question.evidence}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
            editFields,
            id: question.id,
            meta: question.targetField
              ? `${question.subjectType} · ${question.targetField}`
              : "Itinerary call",
            subjectId:
              editFields.length > 0 && question.subjectId
                ? question.subjectId
                : question.id,
            subjectType:
              editFields.length > 0 && question.subjectId
                ? (question.subjectType as ReviewDecisionSubjectType)
                : ("review_question" as const),
            title: formatCallTitle(question.prompt),
            tone: "warning" as const,
          };
        }),
      summaryItems: records.reviewQuestions
        .filter(isNotedQuestion)
        .map((question) =>
          [
            formatCallTitle(question.prompt),
            question.guessedValue
              ? `Used: ${question.guessedValue}`
              : null,
            question.evidence ? `Evidence: ${question.evidence}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        ),
      title: "Calls we made",
    },
    {
      count: records.reviewQuestions.filter(isOpenQuestion).length,
      description: "Generated questions that materially affect the traveler app.",
      emptyDetail: "No trip questions needed.",
      id: "questions",
      items: records.reviewQuestions.filter(isOpenQuestion).map((question) => ({
        combineOptions: [],
        answerType: question.answerType,
        detail: [
          question.guessedValue
            ? `Suggested answer: ${question.guessedValue}.`
            : null,
          question.evidence ? `Evidence: ${question.evidence}` : null,
          question.reason,
        ]
          .filter(Boolean)
          .join(" "),
        editFields: [],
        id: question.id,
        meta: question.targetField
          ? `${question.subjectType} · ${question.targetField}`
          : "Missing detail",
        subjectId: question.id,
        subjectType: "review_question" as const,
        suggestedAnswer: question.guessedValue,
        suggestedAnswerLabel: getSuggestedAnswerLabel(question),
        title: question.prompt,
        tone: "question" as const,
      })),
      summaryItems: records.reviewQuestions
        .filter(isOpenQuestion)
        .map((question) => question.prompt),
      title: "Questions",
    },
    {
      count: records.privateDetails.length,
      description: "One recommended privacy policy for sensitive trip details.",
      emptyDetail: "Recommended privacy is already applied.",
      id: "private-details",
      items: privacyItems,
      summaryItems: records.privateDetails
        .filter((detail) => detail.visibility !== "hidden")
        .map((detail) => detail.label),
      title: "Privacy",
    },
  ];
}
