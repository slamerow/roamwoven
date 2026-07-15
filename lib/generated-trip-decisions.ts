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
  | "move_to_city_tip"
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

export type MoveToCityTipReviewDecision = ReviewDecisionBase & {
  action: "move_to_city_tip";
  subjectType: "item";
  targetLegId?: string | null;
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
  | MoveToCityTipReviewDecision
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

function categoryIdForCityTipSection(section: string) {
  if (section === "Food" || section === "Cafes") {
    return "food_dining";
  }

  if (section === "Drinks") {
    return "nightlife_entertainment";
  }

  if (section === "Shopping") {
    return "shopping_tailor";
  }

  return "admin_logistics";
}

function cityTipSectionForItem(item: TripItemRecord) {
  const text = [item.categoryId, item.title, item.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(cafe|coffee|bakery|breakfast|brunch)\b/.test(text)) {
    return "Cafes";
  }

  if (/\b(food|dining|restaurant|dinner|lunch|eat|bistro|kitchen|market)\b/.test(text)) {
    return "Food";
  }

  if (/\b(bar|beer|wine|cocktail|drink|pub|nightlife)\b/.test(text)) {
    return "Drinks";
  }

  if (/\b(shop|shopping|store|boutique|tailor|watch|market)\b/.test(text)) {
    return "Shopping";
  }

  return "Notes";
}

function appendCityTipEntry(description: string | null, section: string, entry: string) {
  const existing = description?.trim();

  if (!existing) {
    return `${section}: ${entry}`;
  }

  if (existing.toLowerCase().includes(entry.toLowerCase())) {
    return existing;
  }

  const sectionPattern = new RegExp(`(^|\\n)${section}:\\s*`, "i");

  if (sectionPattern.test(existing)) {
    return existing.replace(sectionPattern, (match) => `${match}${entry}; `);
  }

  return `${existing}\n${section}: ${entry}`;
}

function applyMoveToCityTip(
  records: StructuredTripRecords,
  decision: MoveToCityTipReviewDecision
) {
  const source = records.items.find((item) => item.id === decision.subjectId);

  if (!source) {
    return records;
  }

  const leg =
    records.legs.find((item) => item.id === decision.targetLegId) ??
    records.legs.find((item) => item.id === source.legId) ??
    null;

  if (!leg) {
    return applyToRecord(records, "item", source.id, {
      item: (item) => ({
        ...item,
        date: null,
        endTime: null,
        itemType: "note",
        reviewRequired: false,
        startTime: null,
        status: "confirmed",
      }),
    });
  }

  const section = cityTipSectionForItem(source);
  const entry = [source.title, source.description]
    .filter(Boolean)
    .join(" - ");
  const title = `${leg.displayName} Notes & Tips`;
  const existingTip = records.items.find(
    (item) =>
      item.id !== source.id &&
      item.legId === leg.id &&
      item.itemType === "note" &&
      item.status !== "ignored" &&
      /\b(notes?\s*&\s*tips?|tips?|ideas?|recommendations?)\b/i.test(
        [item.title, item.description].filter(Boolean).join(" ")
      )
  );

  if (!existingTip) {
    return applyToRecord(records, "item", source.id, {
      item: (item) => ({
        ...item,
        categoryId: categoryIdForCityTipSection(section),
        date: null,
        description: appendCityTipEntry(null, section, entry),
        endTime: null,
        itemType: "note",
        legId: leg.id,
        locationName: null,
        reviewRequired: false,
        startTime: null,
        status: "confirmed",
        title,
      }),
    });
  }

  return {
    ...records,
    items: records.items.map((item) => {
      if (item.id === existingTip.id) {
        return {
          ...item,
          description: appendCityTipEntry(item.description, section, entry),
          reviewRequired: false,
          status: "confirmed" as const,
        };
      }

      if (item.id === source.id) {
        return {
          ...item,
          parentItemId: existingTip.id,
          reviewRequired: false,
          status: "ignored" as const,
        };
      }

      return item;
    }),
  };
}

const answerTargetFields = {
  item: [
    "address",
    "date",
    "description",
    "endTime",
    "itemType",
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
  stay: [
    "address",
    "addressVisibility",
    "checkInDate",
    "checkOutDate",
    "name",
    "publicLocationLabel",
  ],
  transport: [
    "arrivalLocation",
    "arrivalTime",
    "date",
    "departureLocation",
    "departureTime",
    "description",
    "provider",
    "routeLabel",
    "transportType",
  ],
} as const;

function canPatchTargetField(
  subjectType: TripReviewQuestionRecord["subjectType"],
  targetField: string | null
): subjectType is "item" | "leg" | "stay" | "transport" {
  if (!targetField || subjectType === "trip" || subjectType === "day") {
    return false;
  }

  return (answerTargetFields[subjectType] as readonly string[]).includes(
    targetField
  );
}

function normalizeAnswerTargetField({
  subjectType,
  targetField,
}: {
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  const rawField = targetField?.split(/[/.]/).pop() ?? null;

  if (!rawField) {
    return null;
  }

  if (subjectType === "stay") {
    if (rawField === "checkIn") {
      return "checkInDate";
    }

    if (rawField === "checkOut") {
      return "checkOutDate";
    }

    if (rawField === "title") {
      return "name";
    }
  }

  return rawField;
}

function patchDescriptionAnswer(
  record: { description: string | null },
  answerValue: string
) {
  const existingDescription = record.description?.trim();
  const answer = answerValue.trim();

  if (!existingDescription) {
    return answer;
  }

  if (existingDescription.toLowerCase().includes(answer.toLowerCase())) {
    return existingDescription;
  }

  return `${existingDescription}\n\n${answer}`;
}

function applyMissingStayAnswer({
  question,
  records,
  value,
}: {
  question: TripReviewQuestionRecord;
  records: StructuredTripRecords;
  value: string;
}) {
  if (
    question.subjectType !== "leg" ||
    question.targetField !== "lodging" ||
    !question.subjectId
  ) {
    return null;
  }

  const leg = records.legs.find((candidate) => candidate.id === question.subjectId);
  if (!leg) return records;

  const id = `${question.id}:stay`;
  const stay: TripStayRecord = {
    accessDetailsVisibility: "traveler_password",
    address: null,
    addressVisibility: "traveler_password",
    bookingUrl: null,
    canonicalId: `${question.canonicalId}:stay`,
    checkInDate: leg.arriveDate,
    checkInTime: null,
    checkOutDate: leg.leaveDate,
    checkOutTime: null,
    confirmationLabel: null,
    confirmationVisibility: "traveler_password",
    id,
    latitude: null,
    legId: leg.id,
    longitude: null,
    name: value,
    privateDetailIds: [],
    publicLocationLabel: leg.displayName,
    reviewRequired: false,
    sourceConfidence: "high",
    status: "confirmed",
    stayType: null,
    tripId: records.trip.id,
  };

  return {
    ...records,
    stays: records.stays.some((candidate) => candidate.id === id)
      ? records.stays.map((candidate) => candidate.id === id ? stay : candidate)
      : [...records.stays, stay],
  };
}

function patchAnswerTarget({
  decision,
  question,
  records,
}: {
  decision: AnswerQuestionReviewDecision;
  question: TripReviewQuestionRecord;
  records: StructuredTripRecords;
}) {
  const value =
    decision.answerValue.trim() ||
    (question.answerType === "confirm" ? question.guessedValue : null);
  const targetField = normalizeAnswerTargetField({
    subjectType: question.subjectType,
    targetField: question.targetField,
  });
  const allowedOptions = question.answerOptions ?? [];
  const optionConstrained =
    question.answerType === "choice" ||
    question.answerType === "single_choice";
  const validOption =
    !optionConstrained ||
    (allowedOptions.length > 0 &&
      allowedOptions.some((option) => option.value === value));
  const validDate =
    question.answerType !== "date" ||
    Boolean(
      value &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        (!question.answerMin || value >= question.answerMin) &&
        (!question.answerMax || value <= question.answerMax)
    );
  const validYesNo =
    question.answerType !== "yes_no" ||
    value === "Yes" ||
    value === "No";
  const validTime =
    question.answerType !== "time" ||
    Boolean(value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));

  if (!validOption || !validDate || !validYesNo || !validTime) {
    return { applied: false, records };
  }

  const missingStayRecords = value
    ? applyMissingStayAnswer({ question, records, value })
    : null;
  if (missingStayRecords) {
    const legExists = records.legs.some((leg) => leg.id === question.subjectId);
    return { applied: legExists, records: missingStayRecords };
  }

  if (
    !value ||
    !targetField ||
    !question.subjectId ||
    !canPatchTargetField(question.subjectType, targetField)
  ) {
    return { applied: false, records };
  }

  const targetExists =
    question.subjectType === "item"
      ? records.items.some((record) => record.id === question.subjectId)
      : question.subjectType === "leg"
        ? records.legs.some((record) => record.id === question.subjectId)
        : question.subjectType === "stay"
          ? records.stays.some((record) => record.id === question.subjectId)
          : question.subjectType === "transport"
            ? records.transport.some((record) => record.id === question.subjectId)
            : false;
  if (!targetExists) {
    return { applied: false, records };
  }

  const changes = {
    [targetField]: value,
    reviewRequired: false,
    status: "confirmed",
  };

  const updated = applyToRecord(records, question.subjectType, question.subjectId, {
    item: (record) =>
      ({
        ...record,
        ...changes,
        ...(targetField === "locationName" && value === "Somewhere nearby" &&
        /^(?:breakfast|brunch|coffee|dinner|lunch|meal)$/i.test(record.title)
          ? { title: `${record.title} nearby` }
          : {}),
        ...(targetField === "description"
          ? { description: patchDescriptionAnswer(record, value) }
          : {}),
      }) as TripItemRecord,
    leg: (record) => ({ ...record, ...changes }) as TripLegRecord,
    stay: (record) => ({ ...record, ...changes }) as TripStayRecord,
    transport: (record) =>
      ({
        ...record,
        ...changes,
        ...(targetField === "description"
          ? { description: patchDescriptionAnswer(record, value) }
          : {}),
      }) as TripTransportRecord,
  });

  return { applied: true, records: updated };
}

function applyAnswerQuestion(
  records: StructuredTripRecords,
  decision: AnswerQuestionReviewDecision
) {
  const question = records.reviewQuestions.find(
    (item) => item.id === decision.subjectId
  );
  if (!question) {
    return records;
  }

  const patched = patchAnswerTarget({
    decision,
    question,
    records,
  });
  const resolvedActionApplied = (() => {
    if (!decision.resolvedAction) return false;
    const item = question.subjectType === "item"
      ? records.items.find((record) => record.id === question.subjectId)
      : null;

    if (
      decision.resolvedAction === "combine" ||
      decision.resolvedAction === "move_to_city_tip"
    ) {
      return Boolean(item?.parentItemId && item.status === "ignored");
    }
    if (decision.resolvedAction === "delete") {
      return Boolean(item?.status === "ignored");
    }
    if (decision.resolvedAction === "confirm") {
      return Boolean(item?.status === "confirmed" && !item.reviewRequired);
    }

    return false;
  })();
  if (!patched.applied && !resolvedActionApplied) {
    return records;
  }

  return applyToRecord(
    patched.applied ? patched.records : records,
    "review_question",
    decision.subjectId,
    {
    question: (question) => ({
      ...question,
      answerValue: decision.answerValue,
      resolvedAt: decision.createdAt,
      status: "answered",
    }),
    }
  );
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

  if (decision.action === "move_to_city_tip") {
    return applyMoveToCityTip(records, decision);
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
