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
    value === "date" ||
    value === "time" ||
    value === "visibility" ||
    value === "confirm"
  ) {
    return value;
  }

  return "text";
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

      return [{
        answerType: getAnswerType(getString(detail, "answerType")),
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
