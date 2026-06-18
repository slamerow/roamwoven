import type {
  StructuredTripRecords,
  TripDayRecord,
  TripItemRecord,
  TripLegRecord,
  TripPrivateDetailRecord,
  TripPrivateDetailVisibility,
  TripReviewQuestionRecord,
  TripStayRecord,
  TripTransportRecord,
} from "@/lib/generated-trip-model";

export type ReviewDecisionSubjectType =
  | "day"
  | "leg"
  | "stay"
  | "transport"
  | "item"
  | "private_detail"
  | "review_question";

export type ReviewDecisionAction =
  | "confirm"
  | "edit"
  | "protect"
  | "delete"
  | "combine"
  | "answer_question";

type ReviewDecisionBase = {
  action: ReviewDecisionAction;
  createdAt: string | null;
  id: string;
  note?: string | null;
  subjectId: string;
  subjectType: ReviewDecisionSubjectType;
  tripId: string;
};

type EditableRecord =
  | TripDayRecord
  | TripLegRecord
  | TripStayRecord
  | TripTransportRecord
  | TripItemRecord
  | TripPrivateDetailRecord;

export type ConfirmReviewDecision = ReviewDecisionBase & {
  action: "confirm";
};

export type EditReviewDecision = ReviewDecisionBase & {
  action: "edit";
  changes: Partial<EditableRecord>;
};

export type ProtectReviewDecision = ReviewDecisionBase & {
  action: "protect";
  visibility?: TripPrivateDetailVisibility;
};

export type DeleteReviewDecision = ReviewDecisionBase & {
  action: "delete";
};

export type CombineReviewDecision = ReviewDecisionBase & {
  action: "combine";
  mergedChanges?: Partial<TripItemRecord>;
  sourceIds: string[];
  subjectType: "item";
  targetId: string;
};

export type AnswerQuestionReviewDecision = ReviewDecisionBase & {
  action: "answer_question";
  answerValue: string;
  resolvedAction?: Exclude<ReviewDecisionAction, "answer_question"> | null;
  subjectType: "review_question";
};

export type TripReviewDecision =
  | ConfirmReviewDecision
  | EditReviewDecision
  | ProtectReviewDecision
  | DeleteReviewDecision
  | CombineReviewDecision
  | AnswerQuestionReviewDecision;

function updateById<T extends { id: string }>(
  records: T[],
  id: string,
  update: (record: T) => T
) {
  return records.map((record) => (record.id === id ? update(record) : record));
}

function confirmRecord<T extends { reviewRequired: boolean; status: string }>(
  record: T
) {
  return {
    ...record,
    reviewRequired: false,
    status: "confirmed",
  } as T;
}

function ignoreRecord<T extends { reviewRequired: boolean; status: string }>(
  record: T
) {
  return {
    ...record,
    reviewRequired: false,
    status: "ignored",
  } as T;
}

function applyToRecord(
  records: StructuredTripRecords,
  subjectType: ReviewDecisionSubjectType,
  subjectId: string,
  update: {
    day?: (record: TripDayRecord) => TripDayRecord;
    item?: (record: TripItemRecord) => TripItemRecord;
    leg?: (record: TripLegRecord) => TripLegRecord;
    privateDetail?: (record: TripPrivateDetailRecord) => TripPrivateDetailRecord;
    question?: (record: TripReviewQuestionRecord) => TripReviewQuestionRecord;
    stay?: (record: TripStayRecord) => TripStayRecord;
    transport?: (record: TripTransportRecord) => TripTransportRecord;
  }
): StructuredTripRecords {
  if (subjectType === "day" && update.day) {
    return { ...records, days: updateById(records.days, subjectId, update.day) };
  }

  if (subjectType === "leg" && update.leg) {
    return { ...records, legs: updateById(records.legs, subjectId, update.leg) };
  }

  if (subjectType === "stay" && update.stay) {
    return { ...records, stays: updateById(records.stays, subjectId, update.stay) };
  }

  if (subjectType === "transport" && update.transport) {
    return {
      ...records,
      transport: updateById(records.transport, subjectId, update.transport),
    };
  }

  if (subjectType === "item" && update.item) {
    return { ...records, items: updateById(records.items, subjectId, update.item) };
  }

  if (subjectType === "private_detail" && update.privateDetail) {
    return {
      ...records,
      privateDetails: updateById(
        records.privateDetails,
        subjectId,
        update.privateDetail
      ),
    };
  }

  if (subjectType === "review_question" && update.question) {
    return {
      ...records,
      reviewQuestions: updateById(
        records.reviewQuestions,
        subjectId,
        update.question
      ),
    };
  }

  return records;
}

function applyConfirm(
  records: StructuredTripRecords,
  decision: ConfirmReviewDecision
) {
  return applyToRecord(records, decision.subjectType, decision.subjectId, {
    day: confirmRecord,
    item: confirmRecord,
    leg: confirmRecord,
    privateDetail: (detail) => ({ ...detail, reviewRequired: false }),
    question: (question) => ({
      ...question,
      resolvedAt: decision.createdAt,
      status: "answered",
    }),
    stay: confirmRecord,
    transport: confirmRecord,
  });
}

function applyEdit(records: StructuredTripRecords, decision: EditReviewDecision) {
  return applyToRecord(records, decision.subjectType, decision.subjectId, {
    day: (record) => ({ ...record, ...decision.changes }) as TripDayRecord,
    item: (record) => ({ ...record, ...decision.changes }) as TripItemRecord,
    leg: (record) => ({ ...record, ...decision.changes }) as TripLegRecord,
    privateDetail: (record) =>
      ({ ...record, ...decision.changes }) as TripPrivateDetailRecord,
    stay: (record) => ({ ...record, ...decision.changes }) as TripStayRecord,
    transport: (record) =>
      ({ ...record, ...decision.changes }) as TripTransportRecord,
  });
}

function applyProtect(
  records: StructuredTripRecords,
  decision: ProtectReviewDecision
) {
  const visibility = decision.visibility ?? "traveler_password";

  if (decision.subjectType === "private_detail") {
    return applyToRecord(records, decision.subjectType, decision.subjectId, {
      privateDetail: (detail) => ({
        ...detail,
        reviewRequired: false,
        visibility,
      }),
    });
  }

  const protectedRecords = applyToRecord(
    records,
    decision.subjectType,
    decision.subjectId,
    {
      stay: (stay) => ({
        ...stay,
        accessDetailsVisibility: visibility,
        addressVisibility: visibility,
        confirmationVisibility: visibility,
        reviewRequired: false,
      }),
      transport: (transport) => ({
        ...transport,
        bookingUrlVisibility: visibility,
        confirmationVisibility: visibility,
        reviewRequired: false,
      }),
    }
  );

  return {
    ...protectedRecords,
    privateDetails: protectedRecords.privateDetails.map((detail) =>
      detail.subjectId === decision.subjectId
        ? { ...detail, reviewRequired: false, visibility }
        : detail
    ),
  };
}

function applyDelete(
  records: StructuredTripRecords,
  decision: DeleteReviewDecision
) {
  return applyToRecord(records, decision.subjectType, decision.subjectId, {
    day: ignoreRecord,
    item: ignoreRecord,
    leg: ignoreRecord,
    privateDetail: (detail) => ({
      ...detail,
      reviewRequired: false,
      visibility: "hidden",
    }),
    question: (question) => ({
      ...question,
      resolvedAt: decision.createdAt,
      status: "dismissed",
    }),
    stay: ignoreRecord,
    transport: ignoreRecord,
  });
}

function applyCombine(
  records: StructuredTripRecords,
  decision: CombineReviewDecision
) {
  const sourceIds = new Set(decision.sourceIds);

  return {
    ...records,
    items: records.items.map((item) => {
      if (item.id === decision.targetId) {
        return {
          ...item,
          ...decision.mergedChanges,
          parentItemId: null,
          reviewRequired: false,
          status: "confirmed" as const,
        };
      }

      if (sourceIds.has(item.id)) {
        return {
          ...item,
          parentItemId: decision.targetId,
          reviewRequired: false,
          status: "ignored" as const,
        };
      }

      return item;
    }),
  };
}

function applyAnswerQuestion(
  records: StructuredTripRecords,
  decision: AnswerQuestionReviewDecision
) {
  return applyToRecord(records, "review_question", decision.subjectId, {
    question: (question) => ({
      ...question,
      answerValue: decision.answerValue,
      resolvedAt: decision.createdAt,
      status: "answered",
    }),
  });
}

export function applyReviewDecision(
  records: StructuredTripRecords,
  decision: TripReviewDecision
): StructuredTripRecords {
  if (decision.action === "confirm") {
    return applyConfirm(records, decision);
  }

  if (decision.action === "edit") {
    return applyEdit(records, decision);
  }

  if (decision.action === "protect") {
    return applyProtect(records, decision);
  }

  if (decision.action === "delete") {
    return applyDelete(records, decision);
  }

  if (decision.action === "combine") {
    return applyCombine(records, decision);
  }

  return applyAnswerQuestion(records, decision);
}

export function applyReviewDecisions(
  records: StructuredTripRecords,
  decisions: TripReviewDecision[]
) {
  return decisions.reduce(
    (current, decision) => applyReviewDecision(current, decision),
    records
  );
}
