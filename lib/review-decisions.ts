import { getCurrentUser } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/env";
import {
  applyReviewDecisions,
  type AnswerQuestionReviewDecision,
  type CombineReviewDecision,
  type ConfirmReviewDecision,
  type DeleteReviewDecision,
  type EditReviewDecision,
  type ProtectReviewDecision,
  type ReviewDecisionAction,
  type ReviewDecisionSubjectType,
  type TripReviewDecision,
} from "@/lib/generated-trip-decisions";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type WithoutServerFields<T extends TripReviewDecision> = Omit<
  T,
  "createdAt" | "id"
> & {
  createdAt?: string | null;
  id?: string;
};

export type TripReviewDecisionInput =
  | WithoutServerFields<ConfirmReviewDecision>
  | WithoutServerFields<EditReviewDecision>
  | WithoutServerFields<ProtectReviewDecision>
  | WithoutServerFields<DeleteReviewDecision>
  | WithoutServerFields<CombineReviewDecision>
  | WithoutServerFields<AnswerQuestionReviewDecision>;

export type TripReviewDecisionRow = {
  action: string;
  created_at: string | null;
  decision_key: string | null;
  id: string;
  note: string | null;
  payload_json: unknown;
  subject_id: string;
  subject_type: string;
  trip_id: string;
};

type SerializedDecision = {
  action: ReviewDecisionAction;
  decision_key: string;
  id?: string;
  note: string | null;
  payload_json: Record<string, unknown>;
  subject_id: string;
  subject_type: ReviewDecisionSubjectType;
  trip_id: string;
};

const actions: ReviewDecisionAction[] = [
  "answer_question",
  "combine",
  "confirm",
  "delete",
  "edit",
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

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAction(value: string): value is ReviewDecisionAction {
  return actions.includes(value as ReviewDecisionAction);
}

function isSubjectType(value: string): value is ReviewDecisionSubjectType {
  return subjectTypes.includes(value as ReviewDecisionSubjectType);
}

function isResolvedAction(
  value: unknown
): value is AnswerQuestionReviewDecision["resolvedAction"] {
  return (
    value === "combine" ||
    value === "confirm" ||
    value === "delete" ||
    value === "edit" ||
    value === "protect"
  );
}

export function getReviewDecisionKey(decision: Pick<
  TripReviewDecisionInput,
  "action" | "subjectId" | "subjectType" | "tripId"
>) {
  return [
    decision.tripId,
    decision.subjectType,
    decision.subjectId,
    decision.action,
  ].join(":");
}

export function serializeTripReviewDecision(
  decision: TripReviewDecisionInput
): SerializedDecision {
  const base = {
    action: decision.action,
    decision_key: getReviewDecisionKey(decision),
    id: decision.id,
    note: decision.note ?? null,
    subject_id: decision.subjectId,
    subject_type: decision.subjectType,
    trip_id: decision.tripId,
  };

  if (decision.action === "edit") {
    return {
      ...base,
      payload_json: { changes: decision.changes },
    };
  }

  if (decision.action === "protect") {
    return {
      ...base,
      payload_json: { visibility: decision.visibility ?? "traveler_password" },
    };
  }

  if (decision.action === "combine") {
    return {
      ...base,
      payload_json: {
        mergedChanges: decision.mergedChanges ?? null,
        sourceIds: decision.sourceIds,
        targetId: decision.targetId,
      },
    };
  }

  if (decision.action === "answer_question") {
    return {
      ...base,
      payload_json: {
        answerValue: decision.answerValue,
        resolvedAction: decision.resolvedAction ?? null,
      },
    };
  }

  return {
    ...base,
    payload_json: {},
  };
}

export function normalizeTripReviewDecisionRow(
  row: TripReviewDecisionRow
): TripReviewDecision | null {
  if (!isAction(row.action) || !isSubjectType(row.subject_type)) {
    return null;
  }

  const payload = isRecord(row.payload_json) ? row.payload_json : {};
  const base = {
    createdAt: row.created_at,
    id: row.id,
    note: row.note,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    tripId: row.trip_id,
  };

  if (row.action === "confirm") {
    return { ...base, action: "confirm" };
  }

  if (row.action === "edit") {
    return {
      ...base,
      action: "edit",
      changes: isRecord(payload.changes) ? payload.changes : {},
    } as EditReviewDecision;
  }

  if (row.action === "protect") {
    return {
      ...base,
      action: "protect",
      visibility:
        typeof payload.visibility === "string"
          ? (payload.visibility as ProtectReviewDecision["visibility"])
          : undefined,
    };
  }

  if (row.action === "delete") {
    return { ...base, action: "delete" };
  }

  if (row.action === "combine" && row.subject_type === "item") {
    return {
      ...base,
      action: "combine",
      mergedChanges: isRecord(payload.mergedChanges)
        ? payload.mergedChanges
        : undefined,
      sourceIds: Array.isArray(payload.sourceIds)
        ? payload.sourceIds.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
      subjectType: "item",
      targetId:
        typeof payload.targetId === "string" ? payload.targetId : row.subject_id,
    } as CombineReviewDecision;
  }

  if (row.action === "answer_question" && row.subject_type === "review_question") {
    return {
      ...base,
      action: "answer_question",
      answerValue:
        typeof payload.answerValue === "string" ? payload.answerValue : "",
      resolvedAction: isResolvedAction(payload.resolvedAction)
        ? payload.resolvedAction
        : null,
      subjectType: "review_question",
    };
  }

  return null;
}

export async function listTripReviewDecisions(tripId: string) {
  if (!hasSupabaseServerConfig() || tripId === "demo-trip") {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_review_decisions")
    .select(
      "id,trip_id,action,subject_type,subject_id,payload_json,note,created_at"
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return [];
    }

    throw new Error(`Unable to load review decisions: ${error.message}`);
  }

  return ((data ?? []) as unknown as TripReviewDecisionRow[])
    .map(normalizeTripReviewDecisionRow)
    .filter((decision): decision is TripReviewDecision => Boolean(decision));
}

export async function saveTripReviewDecision(decision: TripReviewDecisionInput) {
  if (!hasSupabaseServerConfig() || decision.tripId === "demo-trip") {
    return {
      ...decision,
      createdAt: decision.createdAt ?? new Date().toISOString(),
      id: decision.id ?? crypto.randomUUID(),
    } as TripReviewDecision;
  }

  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to save review decisions.");
  }

  const supabase = await createSupabaseServerClient();
  const serialized = serializeTripReviewDecision(decision);
  const { data, error } = await supabase
    .from("trip_review_decisions")
    .upsert({
      ...serialized,
      created_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "trip_id,decision_key",
    })
    .select("id,trip_id,action,subject_type,subject_id,payload_json,note,created_at,decision_key")
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to save review decision: ${error?.message ?? "No row"}`
    );
  }

  const normalized = normalizeTripReviewDecisionRow(
    data as unknown as TripReviewDecisionRow
  );

  if (!normalized) {
    throw new Error("Unable to normalize saved review decision.");
  }

  return normalized;
}

export async function applySavedTripReviewDecisions({
  records,
  tripId,
}: {
  records: StructuredTripRecords;
  tripId: string;
}) {
  const decisions = await listTripReviewDecisions(tripId);
  return applyReviewDecisions(records, decisions);
}
