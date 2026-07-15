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
import { getCanonicalReviewId } from "@/lib/extraction/canonical-identity";

function getConfidence(value: string | null): TripSourceConfidence {
  return value === "low" || value === "high" ? value : "medium";
}

function getAnswerType(
  value: string | null
): TripReviewQuestionRecord["answerType"] {
  if (
    value === "choice" ||
    value === "single_choice" ||
    value === "multi_select" ||
    value === "yes_no" ||
    value === "date" ||
    value === "time" ||
    value === "visibility" ||
    value === "confirm"
  ) {
    return value;
  }

  return "text";
}

function getAnswerOptions(detail: DraftObject) {
  return getArray(detail, "answerOptions").flatMap((value) => {
    const option =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as DraftObject)
        : {};
    const label = getString(option, "label");
    const optionValue = getString(option, "value");

    return label && optionValue ? [{ label, value: optionValue }] : [];
  });
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
    {
      canonicalId: string;
      id: string;
      subjectType: TripReviewQuestionRecord["subjectType"];
    }
  >();
  const register = (
    records: Array<{ canonicalId: string; id: string }>,
    subjectType: TripReviewQuestionRecord["subjectType"]
  ) => {
    records.forEach((record) =>
      canonicalSubjects.set(record.canonicalId, {
        canonicalId: record.canonicalId,
        id: record.id,
        subjectType,
      })
    );
  };
  register(items, "item");
  register(legs, "leg");
  register(stays, "stay");
  register(transport, "transport");

  return getArray(draft, "missingDetails").flatMap(
    (value): TripReviewQuestionRecord[] => {
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
      const canonicalReviewId = getCanonicalReviewId(detail);
      if (!canonicalReviewId) {
        throw new Error("Canonical review detail is missing its identity.");
      }
      const canonicalSubject = canonicalPieceId
        ? canonicalSubjects.get(canonicalPieceId)
        : null;
      const subjectType = canonicalSubject?.subjectType ?? "trip";
      const fallbackSubjectId = tripId;
      const answerOptions = getAnswerOptions(detail);
      const requestedAnswerType = getAnswerType(
        getString(detail, "answerType")
      );
      const answerType =
        requestedAnswerType === "multi_select" ||
        ((requestedAnswerType === "choice" ||
          requestedAnswerType === "single_choice") &&
          answerOptions.length < 2)
          ? "text"
          : requestedAnswerType;

      return [{
        answerMax: getString(detail, "answerMax"),
        answerMin: getString(detail, "answerMin"),
        answerOptions,
        answerType,
        answerValue: null,
        canonicalId: canonicalReviewId,
        createdAt: null,
        evidence: getString(detail, "evidence"),
        guessedValue: getString(detail, "guessedValue"),
        id: `${tripId}-${canonicalReviewId}`,
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
        subjectCanonicalId:
          canonicalSubject?.canonicalId ?? fallbackSubjectId,
        subjectId: canonicalSubject?.id ?? fallbackSubjectId,
        subjectType,
        targetField: getString(detail, "targetField"),
        tripId,
      }];
    }
  );
}
