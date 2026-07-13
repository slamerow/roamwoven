import type {
  TripItemRecord,
  TripLegRecord,
  TripReviewQuestionRecord,
  TripSourceConfidence,
  TripStayRecord,
  TripTransportRecord,
} from "@/lib/generated-trip-model";
import {
  type DraftObject,
  getArray,
  getString,
} from "@/lib/extraction/draft-value";

function getConfidence(value: string | null): TripSourceConfidence {
  return value === "low" || value === "high" ? value : "medium";
}

function getAnswerType(
  value: string | null
): TripReviewQuestionRecord["answerType"] {
  if (
    value === "choice" ||
    value === "date" ||
    value === "time" ||
    value === "visibility" ||
    value === "confirm"
  ) {
    return value;
  }

  return "text";
}

function getReviewSubjectType(
  value: string | null
): TripReviewQuestionRecord["subjectType"] {
  if (
    value === "day" ||
    value === "leg" ||
    value === "stay" ||
    value === "transport" ||
    value === "item"
  ) {
    return value;
  }

  return "trip";
}

export function createReviewQuestions({
  draft,
  items,
  legs,
  stays,
  transport,
  tripId,
}: {
  draft: unknown;
  items: TripItemRecord[];
  legs: TripLegRecord[];
  stays: TripStayRecord[];
  transport: TripTransportRecord[];
  tripId: string;
}): TripReviewQuestionRecord[] {
  const canonicalSubjects = new Map<
    string,
    { id: string; subjectType: TripReviewQuestionRecord["subjectType"] }
  >();
  const register = (
    collection: string,
    records: Array<{ id: string }>,
    subjectType: TripReviewQuestionRecord["subjectType"]
  ) => {
    getArray(draft, collection).forEach((value, index) => {
      const record =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as DraftObject)
          : null;
      const canonicalPieceId = getString(record, "_canonicalPieceId");
      const structuredId = records[index]?.id;
      if (canonicalPieceId && structuredId) {
        canonicalSubjects.set(canonicalPieceId, { id: structuredId, subjectType });
      }
    });
  };
  register("activities", items, "item");
  register("places", legs, "leg");
  register("stays", stays, "stay");
  register("transport", transport, "transport");

  return getArray(draft, "missingDetails").flatMap(
    (value, index): TripReviewQuestionRecord[] => {
      const detail =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as DraftObject)
          : {};
      const disposition = getString(detail, "_canonicalReviewDisposition");
      if (
        disposition !== "call" &&
        disposition !== "question" &&
        disposition !== "dismissed"
      ) {
        return [];
      }

      const canonicalPieceId = getString(detail, "relatedCanonicalPieceId");
      const canonicalSubject = canonicalPieceId
        ? canonicalSubjects.get(canonicalPieceId)
        : null;
      const subjectType =
        canonicalSubject?.subjectType ??
        getReviewSubjectType(getString(detail, "subjectType"));

      return [{
        answerType: getAnswerType(getString(detail, "answerType")),
        answerValue: null,
        createdAt: null,
        evidence: getString(detail, "evidence"),
        guessedValue: getString(detail, "guessedValue"),
        id: `${tripId}-canonical-review-${index + 1}`,
        prompt: getString(detail, "prompt") ?? "Confirm a missing detail",
        reason:
          getString(detail, "reason") ??
          "This source-backed detail materially affects the traveler app.",
        resolvedAt: null,
        sourceConfidence: getConfidence(getString(detail, "confidence")),
        status:
          disposition === "call"
            ? "noted"
            : disposition === "dismissed"
              ? "dismissed"
              : "open",
        subjectId: canonicalSubject?.id ?? null,
        subjectType,
        targetField: getString(detail, "targetField"),
        tripId,
      }];
    }
  );
}
