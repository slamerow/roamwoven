import { normalizeText } from "@/lib/extraction/traveler-text";
import type {
  StructuredTripRecords,
  TripDecisionAnchor,
  TripDecisionAnchorSubjectType,
} from "@/lib/generated-trip-model";

const ANCHOR_SUBJECT_TYPES = new Set<TripDecisionAnchorSubjectType>([
  "day",
  "item",
  "leg",
  "private_detail",
  "review_question",
  "stay",
  "transport",
  "trip",
]);

function stableAnchorHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function legKeyForId(records: StructuredTripRecords, legId: string | null) {
  if (!legId) return null;
  return records.legs.find((leg) => leg.id === legId)?.legKey ?? null;
}

function anchor({
  date,
  legKey,
  normalizedTitle,
  sourceAnchorRef = null,
  subjectType,
}: Omit<TripDecisionAnchor, "version" | "sourceAnchorRef"> & {
  sourceAnchorRef?: string | null;
}): TripDecisionAnchor {
  return {
    date,
    legKey,
    normalizedTitle: normalizeText(normalizedTitle),
    sourceAnchorRef,
    subjectType,
    version: 1,
  };
}

function questionSourceAnchorRef(
  question: StructuredTripRecords["reviewQuestions"][number]
) {
  const semanticSource = normalizeText(
    [
      question.targetField,
      question.prompt,
      question.reason,
      question.evidence,
    ]
      .filter(Boolean)
      .join(" ")
  );
  return `review:${stableAnchorHash(semanticSource || question.canonicalId)}`;
}

export function isTripDecisionAnchor(
  value: unknown
): value is TripDecisionAnchor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.normalizedTitle === "string" &&
    (record.date === null || typeof record.date === "string") &&
    (record.legKey === null || typeof record.legKey === "string") &&
    (record.sourceAnchorRef === null ||
      typeof record.sourceAnchorRef === "string") &&
    typeof record.subjectType === "string" &&
    ANCHOR_SUBJECT_TYPES.has(
      record.subjectType as TripDecisionAnchorSubjectType
    ) &&
    Boolean(
      record.normalizedTitle ||
        record.sourceAnchorRef ||
        record.legKey ||
        record.date
    )
  );
}

export function parseTripDecisionAnchor(value: unknown) {
  if (!isTripDecisionAnchor(value)) return null;
  return {
    date: value.date,
    legKey: value.legKey,
    normalizedTitle: normalizeText(value.normalizedTitle),
    sourceAnchorRef: value.sourceAnchorRef,
    subjectType: value.subjectType,
    version: 1 as const,
  };
}

export function createReviewDecisionAnchor(
  records: StructuredTripRecords,
  subjectType: Exclude<TripDecisionAnchorSubjectType, "trip">,
  subjectId: string
): TripDecisionAnchor | null {
  if (subjectType === "day") {
    const day = records.days.find((record) => record.id === subjectId);
    return day
      ? anchor({
          date: day.date,
          legKey: legKeyForId(records, day.primaryLegId),
          normalizedTitle: day.title,
          subjectType,
        })
      : null;
  }

  if (subjectType === "item") {
    const item = records.items.find((record) => record.id === subjectId);
    return item
      ? anchor({
          date: item.date,
          legKey:
            item.cityNoteKey ?? legKeyForId(records, item.legId),
          normalizedTitle: item.title,
          subjectType,
        })
      : null;
  }

  if (subjectType === "leg") {
    const leg = records.legs.find((record) => record.id === subjectId);
    return leg
      ? anchor({
          date: leg.arriveDate,
          legKey: leg.legKey,
          normalizedTitle: leg.displayName,
          subjectType,
        })
      : null;
  }

  if (subjectType === "stay") {
    const stay = records.stays.find((record) => record.id === subjectId);
    return stay
      ? anchor({
          date: stay.checkInDate,
          legKey: legKeyForId(records, stay.legId),
          normalizedTitle: stay.name,
          subjectType,
        })
      : null;
  }

  if (subjectType === "transport") {
    const transport = records.transport.find(
      (record) => record.id === subjectId
    );
    return transport
      ? anchor({
          date: transport.date,
          legKey: legKeyForId(records, transport.legId),
          normalizedTitle: transport.routeLabel,
          subjectType,
        })
      : null;
  }

  if (subjectType === "private_detail") {
    const detail = records.privateDetails.find(
      (record) => record.id === subjectId
    );
    return detail
      ? anchor({
          date: null,
          legKey: null,
          normalizedTitle: detail.label,
          sourceAnchorRef: `private:${stableAnchorHash(
            normalizeText([detail.detailType, detail.label].join(" "))
          )}`,
          subjectType,
        })
      : null;
  }

  const question = records.reviewQuestions.find(
    (record) => record.id === subjectId
  );
  if (!question) return null;

  const subjectAnchor =
    question.subjectType === "trip"
      ? null
      : createReviewDecisionAnchor(
          records,
          question.subjectType,
          question.subjectId
        );
  return anchor({
    date: subjectAnchor?.date ?? null,
    legKey: subjectAnchor?.legKey ?? null,
    normalizedTitle: question.prompt,
    sourceAnchorRef: questionSourceAnchorRef(question),
    subjectType: "review_question",
  });
}

function subjectExists(
  records: StructuredTripRecords,
  subjectType: Exclude<TripDecisionAnchorSubjectType, "trip">,
  subjectId: string
) {
  if (subjectType === "day") return records.days.some((row) => row.id === subjectId);
  if (subjectType === "item") return records.items.some((row) => row.id === subjectId);
  if (subjectType === "leg") return records.legs.some((row) => row.id === subjectId);
  if (subjectType === "private_detail") {
    return records.privateDetails.some((row) => row.id === subjectId);
  }
  if (subjectType === "review_question") {
    return records.reviewQuestions.some((row) => row.id === subjectId);
  }
  if (subjectType === "stay") return records.stays.some((row) => row.id === subjectId);
  return records.transport.some((row) => row.id === subjectId);
}

function candidateIds(
  records: StructuredTripRecords,
  subjectType: Exclude<TripDecisionAnchorSubjectType, "trip">
) {
  if (subjectType === "day") return records.days.map((row) => row.id);
  if (subjectType === "item") return records.items.map((row) => row.id);
  if (subjectType === "leg") return records.legs.map((row) => row.id);
  if (subjectType === "private_detail") {
    return records.privateDetails.map((row) => row.id);
  }
  if (subjectType === "review_question") {
    return records.reviewQuestions.map((row) => row.id);
  }
  if (subjectType === "stay") return records.stays.map((row) => row.id);
  return records.transport.map((row) => row.id);
}

function anchorMatches(
  expected: TripDecisionAnchor,
  candidate: TripDecisionAnchor
) {
  if (expected.subjectType !== candidate.subjectType) return false;
  if (
    expected.sourceAnchorRef &&
    expected.sourceAnchorRef !== candidate.sourceAnchorRef
  ) {
    return false;
  }
  if (
    expected.normalizedTitle &&
    expected.normalizedTitle !== candidate.normalizedTitle
  ) {
    return false;
  }
  if (expected.legKey && expected.legKey !== candidate.legKey) return false;
  if (expected.date && expected.date !== candidate.date) return false;
  return true;
}

/** Direct id first; otherwise one and only one anchor match. */
export function resolveReviewDecisionSubjectId(
  records: StructuredTripRecords,
  subjectType: Exclude<TripDecisionAnchorSubjectType, "trip">,
  subjectId: string,
  decisionAnchor: TripDecisionAnchor | null | undefined
) {
  if (subjectExists(records, subjectType, subjectId)) return subjectId;
  if (!decisionAnchor || decisionAnchor.subjectType !== subjectType) return null;

  const matches = candidateIds(records, subjectType).filter((candidateId) => {
    const candidate = createReviewDecisionAnchor(
      records,
      subjectType,
      candidateId
    );
    return candidate ? anchorMatches(decisionAnchor, candidate) : false;
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function attachReviewQuestionDecisionAnchors(
  records: StructuredTripRecords
): StructuredTripRecords {
  return {
    ...records,
    reviewQuestions: records.reviewQuestions.map((question) => ({
      ...question,
      decisionAnchor: createReviewDecisionAnchor(
        records,
        "review_question",
        question.id
      ),
    })),
  };
}
