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
import { applyReviewIdentityGate } from "@/lib/extraction/review-identity-gate";

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
      const coercedAnswerType =
        requestedAnswerType === "multi_select" ||
        ((requestedAnswerType === "choice" ||
          requestedAnswerType === "single_choice") &&
          answerOptions.length < 2)
          ? "text"
          : requestedAnswerType;
      // A date-target question always gets a date control (RW-QUE-001;
      // live-run 7.18.2 shipped trip/date questions with free-text inputs).
      const targetFieldValue = getString(detail, "targetField") ?? "";
      const answerType =
        coercedAnswerType === "text" && /date/i.test(targetFieldValue)
          ? "date"
          : coercedAnswerType;

      // Arc F.3 (run 7.25.0 chain C): the review-surface identity gate runs
      // again HERE, at the last boundary before the maker sees the question.
      // The draft boundary (`canonicalizeCanonicalReviewDetails`) is the
      // primary gate; this is the same shared predicate set applied as
      // defense-in-depth, so a draft persisted by an older build — or any
      // path that reaches projection without re-canonicalizing — still cannot
      // ship an identity ask or an identity value in question prose.
      //
      // It DISMISSES, never drops: `validateStructuredTripRecords` requires a
      // projected record for every draft missingDetail
      // (draft-to-structured-trip.ts:846-851), so filtering here would fail a
      // compile invariant and could kill a usable run. Both boundaries run
      // the same pure function, so they agree by construction and no
      // draft/projection disposition disagreement can arise.
      const identityGate = applyReviewIdentityGate({
        evidence: getString(detail, "evidence"),
        guessedValue: getString(detail, "guessedValue"),
        prompt: getString(detail, "prompt"),
        reason: getString(detail, "reason"),
        targetField: targetFieldValue,
      });
      const identityDismissed =
        disposition === "question" && identityGate.dismissalReason !== null;
      const gatedDisposition = identityDismissed ? "dismissed" : disposition;
      const gatedText = <K extends "evidence" | "guessedValue" | "prompt" | "reason">(
        field: K
      ) =>
        identityGate.scrubbed[field] !== undefined
          ? identityGate.scrubbed[field] ?? null
          : getString(detail, field);

      const memberSnapshots = getArray(detail, "_canonicalMemberSnapshots")
        .flatMap((snapshot) => {
          const record =
            snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
              ? (snapshot as DraftObject)
              : null;
          if (!record) return [];
          return [{
            canonicalId: getString(record, "canonicalPieceId"),
            category: getString(record, "category"),
            city: getString(record, "city"),
            date: getString(record, "date"),
            description: getString(record, "description"),
            title: getString(record, "title"),
          }];
        });

      return [{
        answerMax: getString(detail, "answerMax"),
        answerMin: getString(detail, "answerMin"),
        answerOptions,
        answerType,
        ...(memberSnapshots.length > 0 ? { memberSnapshots } : {}),
        answerValue: null,
        canonicalId: canonicalReviewId,
        createdAt: null,
        // Run 7.23.2 chain 8.3: a dismissed question used to reach the
        // records as a bare status — the gate/sweep trace stayed behind on
        // the draft detail. The reason now rides the record so audits can
        // QUOTE the dismissal and Arc G's rebind (T3) can key off it.
        dismissalReason:
          gatedDisposition === "dismissed"
            ? (identityDismissed ? identityGate.dismissalReason : null) ??
              getString(detail, "_canonicalQuestionGate") ??
              "dismissed during canonical assembly"
            : null,
        evidence: gatedText("evidence"),
        guessedValue: gatedText("guessedValue"),
        id: `${tripId}-${canonicalReviewId}`,
        prompt: gatedText("prompt") ?? "Confirm a missing detail",
        reason:
          gatedText("reason") ??
          "This source-backed detail materially affects the traveler app.",
        resolvedAt: null,
        sourceConfidence: getConfidence(getString(detail, "confidence")),
        status:
          gatedDisposition === "call"
            ? "noted"
            : gatedDisposition === "dismissed"
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
