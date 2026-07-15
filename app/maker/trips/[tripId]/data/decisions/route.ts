import { NextRequest, NextResponse } from "next/server";
import type {
  ReviewDecisionSubjectType,
} from "@/lib/generated-trip-decisions";
import { saveTripReviewDecision } from "@/lib/review-decisions";
import { getMakerTrip } from "@/lib/trips";

type WritableReviewDecisionAction =
  | "answer_question"
  | "combine"
  | "confirm"
  | "delete"
  | "edit"
  | "move_to_city_tip"
  | "protect";

const writableActions: WritableReviewDecisionAction[] = [
  "answer_question",
  "combine",
  "confirm",
  "delete",
  "edit",
  "move_to_city_tip",
  "protect",
];

const subjectTypes: ReviewDecisionSubjectType[] = [
  "day",
  "item",
  "leg",
  "private_detail",
  "review_question",
  "stay",
  "transport",
];

function isWritableAction(value: string): value is WritableReviewDecisionAction {
  return writableActions.includes(value as WritableReviewDecisionAction);
}

function isSubjectType(value: string): value is ReviewDecisionSubjectType {
  return subjectTypes.includes(value as ReviewDecisionSubjectType);
}

const editableFieldsBySubject: Partial<Record<ReviewDecisionSubjectType, string[]>> = {
  item: [
    "address",
    "categoryId",
    "date",
    "description",
    "endTime",
    "itemType",
    "legId",
    "locationName",
    "startTime",
    "title",
    "url",
  ],
  leg: [
    "arriveDate",
    "city",
    "country",
    "language",
    "leaveDate",
    "summary",
    "timezone",
  ],
  private_detail: ["detailType", "label", "reason", "value", "visibility"],
  stay: [
    "address",
    "addressVisibility",
    "checkInDate",
    "checkInTime",
    "checkOutDate",
    "checkOutTime",
    "name",
    "publicLocationLabel",
  ],
  transport: [
    "arrivalLocation",
    "arrivalTime",
    "confirmationLabel",
    "date",
    "departureLocation",
    "departureTime",
    "description",
    "provider",
    "routeLabel",
    "transportType",
  ],
};

function parseEditChanges(
  formData: FormData,
  subjectType: ReviewDecisionSubjectType
) {
  const allowedFields = editableFieldsBySubject[subjectType] ?? [];
  const changes: Record<string, string | null | boolean> = {};

  for (const field of allowedFields) {
    const rawValue = formData.get(`field:${field}`);

    if (rawValue === null) {
      continue;
    }

    changes[field] = String(rawValue).trim() || null;
  }

  if (Object.keys(changes).length > 0 && subjectType !== "review_question") {
    if (
      subjectType === "item" &&
      changes.itemType === "activity" &&
      !changes.date
    ) {
      changes.reviewRequired = true;
      changes.status = "needs_review";
    } else {
      changes.reviewRequired = false;
      changes.status = "confirmed";
    }
  }

  return changes;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  let returnUrl = new URL(`/maker/trips/${tripId}/data`, request.url);

  function respond(
    params: { decision?: string; error?: string },
    status = params.error ? 400 : 200
  ) {
    const dataUrl = new URL(returnUrl);

    for (const [key, value] of Object.entries(params)) {
      if (value) {
        dataUrl.searchParams.set(key, value);
      }
    }

    if (wantsJson) {
      return NextResponse.json(
        {
          ok: !params.error,
          ...params,
        },
        { status }
      );
    }

    return NextResponse.redirect(dataUrl, 303);
  }

  if (trip.isDemo) {
    return respond({ decision: "demo" });
  }

  if (trip.paymentStatus !== "paid") {
    return respond({ error: "checkout-required" }, 403);
  }

  try {
    const formData = await request.formData();
    const action = String(formData.get("action") ?? "");
    const subjectType = String(formData.get("subjectType") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const returnTo = String(formData.get("returnTo") ?? "");
    const note = String(formData.get("note") ?? "").trim() || null;

    if (returnTo === "summary") {
      returnUrl = new URL(`/maker/trips/${tripId}/summary`, request.url);
    }

    if (!isWritableAction(action) || !isSubjectType(subjectType) || !subjectId) {
      return respond({ error: "decision-invalid" });
    }

    const subjectIds = String(formData.get("subjectIds") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      subjectIds.length > 0 &&
      (action === "confirm" || action === "protect" || action === "delete")
    ) {
      await Promise.all(
        subjectIds.map((currentSubjectId) =>
          saveTripReviewDecision({
            action,
            note,
            subjectId: currentSubjectId,
            subjectType,
            tripId,
          })
        )
      );
      return respond({ decision: "saved" });
    }

    if (action === "answer_question") {
      if (subjectType !== "review_question") {
        return respond({ error: "decision-invalid" });
      }
      const answerValue = String(formData.get("answerValue") ?? "").trim();
      if (!answerValue) {
        return respond({ error: "decision-invalid" });
      }

      await saveTripReviewDecision({
        action,
        answerValue,
        note,
        subjectId,
        subjectType,
        tripId,
      });
    } else if (action === "edit") {
      const changes = parseEditChanges(formData, subjectType);

      if (Object.keys(changes).length === 0) {
        return respond({ error: "decision-invalid" });
      }

      await saveTripReviewDecision({
        action,
        changes,
        note,
        subjectId,
        subjectType,
        tripId,
      });
    } else if (action === "combine") {
      const sourceId = String(formData.get("sourceId") ?? "");
      const targetId = String(formData.get("targetId") ?? subjectId);

      if (subjectType !== "item" || !sourceId || !targetId) {
        return respond({ error: "decision-invalid" });
      }

      await saveTripReviewDecision({
        action,
        note,
        sourceIds: [sourceId],
        subjectId: targetId,
        subjectType,
        targetId,
        tripId,
      });
    } else if (action === "move_to_city_tip") {
      if (subjectType !== "item") {
        return respond({ error: "decision-invalid" });
      }

      const targetLegId = String(formData.get("targetLegId") ?? "").trim() || null;

      await saveTripReviewDecision({
        action,
        note,
        subjectId,
        subjectType,
        targetLegId,
        tripId,
      });
    } else {
      await saveTripReviewDecision({
        action,
        note,
        subjectId,
        subjectType,
        tripId,
      });
    }

    return respond({ decision: "saved" });
  } catch {
    return respond({ error: "decision-save-failed" });
  }
}
