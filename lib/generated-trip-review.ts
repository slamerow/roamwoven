import type { ReviewDecisionSubjectType } from "@/lib/generated-trip-decisions";
import type {
  StructuredTripRecords,
  TripRecordStatus,
} from "@/lib/generated-trip-model";
import { isLegCityTipRecord } from "@/lib/trip-card-taxonomy";
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

type ReviewQuestionSubjectType =
  StructuredTripRecords["reviewQuestions"][number]["subjectType"];

function isCityTipItem(item: StructuredTripRecords["items"][number]) {
  return isLegCityTipRecord(item);
}

function getReviewActivityItems(records: StructuredTripRecords) {
  return records.items.filter(
    (item) => isActiveStatus(item.status) && item.itemType === "activity"
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

  return records.reviewQuestions.filter(isOpenQuestion).length;
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
  reviewCount = getStructuredReviewCount(records),
  options: { blockingIssueCount?: number } = {}
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
  const blockingIssueCount = options.blockingIssueCount ?? 0;
  const reviewText =
    reviewCount > 0
      ? `We need you to confirm ${pluralize(reviewCount, "thing")} before this becomes the traveler app.`
      : blockingIssueCount > 0
        ? `There ${blockingIssueCount === 1 ? "is" : "are"} ${pluralize(blockingIssueCount, "summary warning")} to resolve before publish review.`
      : "Nothing needs confirmation before this becomes the traveler app.";

  return `${foundText} ${reviewText}`;
}

export function getStructuredReviewSections(
  records: StructuredTripRecords
): StructuredReviewSection[] {
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
      items: [],
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
      items: [],
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
      items: [],
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
      items: [],
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
      items: [],
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
      items: [],
      summaryItems: records.privateDetails
        .filter((detail) => detail.visibility !== "hidden")
        .map((detail) => detail.label),
      title: "Privacy",
    },
  ];
}
