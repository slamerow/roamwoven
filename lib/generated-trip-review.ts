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

function isOpenQuestion(question: StructuredTripRecords["reviewQuestions"][number]) {
  return question.status === "open";
}

function isNotedQuestion(question: StructuredTripRecords["reviewQuestions"][number]) {
  return question.status === "noted";
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
      title: "Exact stay addresses",
      detail:
        "Recommended: show hotel or area labels publicly, but keep exact private addresses behind the trip password.",
    };
  }

  return {
    id: "private-notes",
    title: "Personal and private notes",
    detail:
      "Recommended: keep personal contacts, family logistics, and safety-sensitive notes behind the trip password.",
  };
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
  const foodAndDining = records.items.filter(
    (item) => item.categoryId === "food_dining"
  ).length;
  const activities = records.items.length;

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
  ].filter(Boolean);
}

export function getStructuredScannedParts(records: StructuredTripRecords | null) {
  if (!records) {
    return [];
  }

  const foodAndDining = records.items.filter(
    (item) => item.categoryId === "food_dining"
  ).length;
  const activities = records.items.length;

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
  const privacyGroups = new Map<
    string,
    {
      detail: string;
      items: StructuredReviewItem["childItems"];
      subjectIds: string[];
      title: string;
    }
  >();

  records.privateDetails
    .filter((detail) => detail.reviewRequired)
    .forEach((detail) => {
      const group = getPrivacyGroup(detail.detailType);
      const existing =
        privacyGroups.get(group.id) ??
        {
          detail: group.detail,
          items: [],
          subjectIds: [],
          title: group.title,
        };

      existing.subjectIds.push(detail.id);
      existing.items?.push({
        detail:
          detail.reason ??
          "This private detail should be reviewed before the app is shared.",
        id: detail.id,
        meta: detail.detailType,
        title: detail.label,
      });
      privacyGroups.set(group.id, existing);
    });

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
      description: "Lodging records with dates, public labels, addresses, and access privacy.",
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
            formatReviewDateRange(stay.checkInDate, stay.checkOutDate) ||
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
            .join(" · ")
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
        .map((item) => [item.routeLabel, item.date].filter(Boolean).join(" · ")),
      title: "Transport",
    },
    {
      count: records.items.filter((item) => isActiveStatus(item.status)).length,
      description: "Activities table rows, each with a Wren-style category.",
      emptyDetail: "No activity decisions needed.",
      id: "activities",
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
      summaryItems: records.categories
        .map((category) => {
          const items = records.items.filter(
            (item) => item.categoryId === category.id && isActiveStatus(item.status)
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
      count: records.privateDetails.length,
      description: "Recommended privacy groups for addresses, confirmations, access notes, and personal details.",
      emptyDetail: "Recommended privacy is already applied.",
      id: "private-details",
      items: Array.from(privacyGroups.entries()).map(([groupId, group]) => ({
          combineOptions: [],
          childItems: group.items,
          detail: group.detail,
          editFields: [],
          id: `privacy-${groupId}`,
          meta: pluralize(group.subjectIds.length, "detail"),
          subjectId: group.subjectIds[0] ?? `privacy-${groupId}`,
          subjectIds: group.subjectIds,
          subjectType: "private_detail" as const,
          title: group.title,
          tone: "sensitive" as const,
        })),
      summaryItems: records.privateDetails
        .filter((detail) => detail.visibility !== "hidden")
        .map((detail) => detail.label),
      title: "Privacy",
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
            title: question.prompt,
            tone: "warning" as const,
          };
        }),
      summaryItems: records.reviewQuestions
        .filter(isNotedQuestion)
        .map((question) =>
          [
            question.prompt,
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
        detail: [
          question.guessedValue
            ? `Roamwoven thinks the answer is ${question.guessedValue}.`
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
        title: question.prompt,
        tone: "question" as const,
      })),
      summaryItems: records.reviewQuestions
        .filter(isOpenQuestion)
        .map((question) => question.prompt),
      title: "Questions",
    },
  ];
}
