import type {
  CanonicalEvidenceResolverMetadata,
} from "@/lib/extraction/canonical-evidence-resolver";
import {
  type CanonicalEvidencePiece,
  type EvidenceObservation,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import type { RecoverySourceBindingSidecarV1 } from "@/lib/extraction/recovery-source-binding";
import {
  alignSourceCandidateV1,
  type SourceFactLedgerBuildResultV1,
  type SourceFactV1,
} from "@/lib/extraction/source-fact-ledger";
import {
  hashStableValue,
  stableJsonStringify,
  type SourceDocumentIndexV1,
} from "@/lib/extraction/source-document-index";
import { normalizeText } from "@/lib/extraction/traveler-text";
import type {
  StructuredTripRecords,
  TripItemRecord,
  TripPrivateDetailRecord,
  TripReviewQuestionRecord,
  TripStayRecord,
  TripTransportRecord,
} from "@/lib/generated-trip-model";
import {
  ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
  ASSEMBLY_DECISION_WRITER_VERSION,
  createAssemblyDecisionIdV1,
  createCarrierAnchorHashV1,
  createResolverRoleEvaluationIdV1,
  digestResolverReasonV1,
  finalizeAssemblyDecisionCarrierSetV1,
  type AssemblyDecisionCarrierBuildResultV1,
  type AssemblyDecisionDomainV1,
  type AssemblyDecisionProducerV1,
  type AssemblyDecisionV1,
  type CarrierAnchorClassV1,
  type FactTerminalDispositionV1,
  type ResolverRoleEvaluationV1,
  type ResolverSourceLaneV1,
} from "@/lib/extraction/assembly-decision-carrier-ledger";

type CandidateClass =
  | "activity"
  | "decision"
  | "place"
  | "protected_detail"
  | "stay"
  | "transport";

type CandidateDescriptor = {
  alignment: ReturnType<typeof alignSourceCandidateV1>;
  factId: string | null;
  record: Record<string, unknown>;
  recordClass: CandidateClass;
  resolverCandidateId: string | null;
  stage: EvidenceStageInput;
};

type CarrierTarget = {
  anchorHash: string;
  canonicalId: string;
  carrierClass: CarrierAnchorClassV1;
  parentItemId: string | null;
};

type EntityResolution = {
  carrierTargets: CarrierTarget[];
  outcome: "carried" | "evidence_only" | "unresolved";
  reasonCode: string;
};

type RelationshipResolution = {
  carrierAnchorHashes: string[];
  outcome: "applied" | "rejected" | "unresolved";
  reasonCode: string;
};

const RECORD_ARRAYS: Array<{
  key: string;
  recordClass: CandidateClass;
}> = [
  { key: "activities", recordClass: "activity" },
  { key: "stays", recordClass: "stay" },
  { key: "transport", recordClass: "transport" },
  { key: "places", recordClass: "place" },
  { key: "missingDetails", recordClass: "decision" },
  { key: "sensitiveDetails", recordClass: "protected_detail" },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function candidateTitle(record: Record<string, unknown>) {
  return (
    stringValue(record, "title") ??
    stringValue(record, "name") ??
    stringValue(record, "routeLabel") ??
    stringValue(record, "relatedTitle") ??
    stringValue(record, "prompt") ??
    ""
  );
}

function semanticIdentityDigest(
  alignment: ReturnType<typeof alignSourceCandidateV1>,
  record: Record<string, unknown>
) {
  return hashStableValue({
    sourceSpanIds: alignment.sourceSpanIds,
    title: normalizeText(candidateTitle(record)),
  }).slice(0, 20);
}

function candidateFactKey({
  digest,
  kind,
  recordClass,
}: {
  digest: string;
  kind: "decision" | "entity";
  recordClass: CandidateClass;
}) {
  return kind === "decision"
    ? `decision:${digest}`
    : `entity:${recordClass}:${digest}`;
}

function factLookupKey(fact: SourceFactV1) {
  const digest = stringValue(fact.payload, "semanticIdentityDigest");
  if (!digest) return null;
  if (fact.kind === "decision") return `decision:${digest}`;
  if (fact.kind !== "entity") return null;
  const recordClass = stringValue(fact.payload, "recordClass");
  return recordClass ? `entity:${recordClass}:${digest}` : null;
}

function sourceLaneForDescriptor(
  descriptor: CandidateDescriptor | null
): ResolverSourceLaneV1 {
  if (!descriptor) return "chunk";
  if (descriptor.stage.source === "model_spine") {
    return "spine";
  }
  if (
    asRecord(descriptor.stage.stage)._sourceRecovery === true ||
    descriptor.record._sourceRecovery === true
  ) {
    return "recovery";
  }
  return "chunk";
}

function observationClass(observation: EvidenceObservation): CandidateClass | null {
  if (
    observation.kind === "activity" ||
    observation.kind === "note" ||
    observation.kind === "context"
  ) {
    return "activity";
  }
  if (
    observation.kind === "decision" ||
    observation.kind === "place" ||
    observation.kind === "stay" ||
    observation.kind === "transport"
  ) {
    return observation.kind;
  }
  return null;
}

function observationJoinKey({
  date,
  recordClass,
  sourceLabel,
  sourceUploadId,
  title,
}: {
  date: string | null;
  recordClass: CandidateClass;
  sourceLabel: string;
  sourceUploadId: string | null;
  title: string;
}) {
  return stableJsonStringify({
    date,
    recordClass,
    sourceLabel,
    sourceUploadId,
    title: normalizeText(title),
  });
}

function recordDate(record: Record<string, unknown>) {
  return (
    stringValue(record, "date") ??
    stringValue(record, "checkIn") ??
    stringValue(record, "checkInDate") ??
    stringValue(record, "firstNightDate") ??
    null
  );
}

function candidateDescriptors({
  index,
  sourceFacts,
  stages,
}: {
  index: SourceDocumentIndexV1;
  sourceFacts: SourceFactV1[];
  stages: EvidenceStageInput[];
}) {
  const factsByKey = new Map<string, SourceFactV1[]>();
  const relationshipFactIdsBySpanId = new Map<string, string[]>();
  for (const fact of sourceFacts) {
    const key = factLookupKey(fact);
    if (key) factsByKey.set(key, [...(factsByKey.get(key) ?? []), fact]);
    if (fact.kind === "relationship") {
      for (const spanId of fact.sourceSpanIds) {
        relationshipFactIdsBySpanId.set(spanId, [
          ...(relationshipFactIdsBySpanId.get(spanId) ?? []),
          fact.factId,
        ]);
      }
    }
  }
  const factById = new Map(sourceFacts.map((fact) => [fact.factId, fact]));
  const descriptors: CandidateDescriptor[] = [];

  for (const stage of stages) {
    const stageRecord = asRecord(stage.stage);
    for (const { key, recordClass } of RECORD_ARRAYS) {
      const values = Array.isArray(stageRecord[key])
        ? (stageRecord[key] as unknown[])
        : [];
      for (const value of values) {
        const record = asRecord(value);
        if (Object.keys(record).length === 0) continue;
        const alignment = alignSourceCandidateV1({ index, record, stage });
        const groupingProposal =
          recordClass === "activity" &&
          stringValue(record, "evidenceRole") === "grouping_proposal";
        let factId: string | null = null;
        if (groupingProposal) {
          const candidates = sortedUnique(
            [...alignment.sourceSpanIds, ...alignment.plausibleSpanIds].flatMap(
              (spanId) => relationshipFactIdsBySpanId.get(spanId) ?? []
            )
          ).filter((candidateId) => {
            const fact = factById.get(candidateId);
            return Boolean(
              fact &&
                [...alignment.sourceSpanIds, ...alignment.plausibleSpanIds].every(
                  (spanId) => fact.sourceSpanIds.includes(spanId)
                )
            );
          });
          factId = candidates.length === 1 ? candidates[0] : null;
        } else {
          const kind = recordClass === "decision" ? "decision" : "entity";
          const keyValue = candidateFactKey({
            digest: semanticIdentityDigest(alignment, record),
            kind,
            recordClass,
          });
          const candidates = factsByKey.get(keyValue) ?? [];
          factId = candidates.length === 1 ? candidates[0].factId : null;
        }
        descriptors.push({
          alignment,
          factId,
          record,
          recordClass,
          resolverCandidateId: stringValue(record, "_resolverCandidateId"),
          stage,
        });
      }
    }
  }
  return descriptors;
}

function buildResolverEvaluations({
  descriptors,
  recoverySourceBindings,
  resolverMetadata,
}: {
  descriptors: CandidateDescriptor[];
  recoverySourceBindings: RecoverySourceBindingSidecarV1 | null;
  resolverMetadata: CanonicalEvidenceResolverMetadata | null;
}) {
  const descriptorByCandidateId = new Map(
    descriptors.flatMap((descriptor) =>
      descriptor.resolverCandidateId
        ? [[descriptor.resolverCandidateId, descriptor] as const]
        : []
    )
  );
  const recoveryBindingByCandidateId = new Map(
    (recoverySourceBindings?.candidateBindings ?? []).flatMap((binding) =>
      binding.ephemeralResolverCandidateId
        ? [[binding.ephemeralResolverCandidateId, binding] as const]
        : []
    )
  );
  // Two raw proposals can become intentionally indistinguishable after their
  // forbidden transient candidate IDs are dropped (for example, overlapping
  // chunks that resolve to the same source fact). Preserve the raw
  // multiplicity with a deterministic ordinal over the durable identity. The
  // entries are otherwise identical, so response order can only exchange
  // which transient proposal receives an ordinal; it cannot change the
  // persisted ID set or hash.
  const occurrenceOrdinalByDurableIdentity = new Map<string, number>();

  return (resolverMetadata?.roleEvaluations ?? [])
    .map((evaluation): ResolverRoleEvaluationV1 => {
      const descriptor = descriptorByCandidateId.get(evaluation.candidateId) ?? null;
      const binding = recoveryBindingByCandidateId.get(evaluation.candidateId) ?? null;
      const subjectFactIds = descriptor?.factId ? [descriptor.factId] : [];
      const unresolvedSourceSpanIds = subjectFactIds.length > 0
        ? []
        : sortedUnique([
            ...(descriptor?.alignment.plausibleSpanIds ?? []),
            ...(binding?.sourceSpanIds ?? []),
            ...(binding?.unresolvedSourceSpanIds ?? []),
          ]);
      const sourceLane = binding ? "recovery" : sourceLaneForDescriptor(descriptor);
      const reasonDigest = digestResolverReasonV1(evaluation.reason);
      const stableWindowDigest = hashStableValue({
        factIds: sortedUnique(
          evaluation.windowCandidateIds.flatMap((candidateId) => {
            const candidate = descriptorByCandidateId.get(candidateId);
            return candidate?.factId ? [candidate.factId] : [];
          })
        ),
        sourceLane,
        unresolvedSourceSpanIds,
      });
      const input = {
        confidence: evaluation.confidence,
        duplicateOrdinal: evaluation.duplicateOrdinal,
        proposedRole: evaluation.classification,
        reasonDigest,
        reconciliationOutcome: evaluation.reconciliationOutcome,
        rejectionCodes: evaluation.rejectionCodes,
        sourceLane,
        stableWindowDigest,
        subjectFactIds,
        unresolvedSourceSpanIds,
      };
      const durableIdentity = stableJsonStringify(input);
      const indistinguishableOccurrenceOrdinal =
        occurrenceOrdinalByDurableIdentity.get(durableIdentity) ?? 0;
      occurrenceOrdinalByDurableIdentity.set(
        durableIdentity,
        indistinguishableOccurrenceOrdinal + 1
      );
      const evaluationId = createResolverRoleEvaluationIdV1({
        ...input,
        indistinguishableOccurrenceOrdinal,
      });
      return {
        confidence: input.confidence,
        evaluationId,
        proposedRole: input.proposedRole,
        reasonDigest,
        reconciliationOutcome: input.reconciliationOutcome,
        rejectionCodes: sortedUnique(input.rejectionCodes) as ResolverRoleEvaluationV1["rejectionCodes"],
        sourceLane,
        subjectFactIds,
        unresolvedSourceSpanIds,
      };
    })
    .sort((left, right) => left.evaluationId.localeCompare(right.evaluationId));
}

function addToMapArray<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function recordTitleDigest(value: string) {
  return hashStableValue({ title: normalizeText(value) }).slice(0, 40);
}

function legKeyById(records: StructuredTripRecords) {
  return new Map(records.legs.map((leg) => [leg.id, leg.legKey]));
}

function anchorForItem(
  item: TripItemRecord,
  factId: string,
  legKeys: Map<string, string>
) {
  const carrierClass = item.itemType === "note" ? "city_note" : "activity";
  return {
    anchorHash: createCarrierAnchorHashV1({
      carrierClass,
      context:
        carrierClass === "city_note"
          ? {
              cityNoteKey: item.cityNoteKey ?? null,
              normalizedTitleDigest: recordTitleDigest(item.title),
            }
          : {
              date: item.date,
              legKey: item.legId ? legKeys.get(item.legId) ?? null : null,
              normalizedTitleDigest: recordTitleDigest(item.title),
            },
      sourceFactIds: [factId],
    }),
    canonicalId: item.canonicalId,
    carrierClass,
    parentItemId: item.parentItemId,
  } satisfies CarrierTarget;
}

function anchorForStay(
  stay: TripStayRecord,
  factId: string,
  legKeys: Map<string, string>
) {
  return {
    anchorHash: createCarrierAnchorHashV1({
      carrierClass: "stay",
      context: {
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        legKey: stay.legId ? legKeys.get(stay.legId) ?? null : null,
        normalizedNameDigest: recordTitleDigest(stay.name),
      },
      sourceFactIds: [factId],
    }),
    canonicalId: stay.canonicalId,
    carrierClass: "stay",
    parentItemId: null,
  } satisfies CarrierTarget;
}

function anchorForTransport(
  transport: TripTransportRecord,
  factId: string,
  legKeys: Map<string, string>
) {
  return {
    anchorHash: createCarrierAnchorHashV1({
      carrierClass: "transport",
      context: {
        arrivalEndpointDigest: transport.arrivalLocation
          ? recordTitleDigest(transport.arrivalLocation)
          : null,
        departureContext: hashStableValue({
          date: transport.date,
          time: transport.departureTime,
        }).slice(0, 40),
        departureEndpointDigest: transport.departureLocation
          ? recordTitleDigest(transport.departureLocation)
          : null,
        legKey: transport.legId
          ? legKeys.get(transport.legId) ?? null
          : null,
      },
      sourceFactIds: [factId],
    }),
    canonicalId: transport.canonicalId,
    carrierClass: "transport",
    parentItemId: null,
  } satisfies CarrierTarget;
}

function privateDetailKey(detailType: string, value: string) {
  return stableJsonStringify({
    detailType: normalizeText(detailType),
    valueDigest: hashStableValue({ value: normalizeText(value) }),
  });
}

function reviewExactKey(targetField: string | null, prompt: string | null) {
  return stableJsonStringify({
    prompt: normalizeText(prompt),
    targetField: normalizeText(targetField),
  });
}

function reviewSubjectKey(targetField: string | null, subjectTitle: string | null) {
  return stableJsonStringify({
    subjectTitle: normalizeText(subjectTitle),
    targetField: normalizeText(targetField),
  });
}

function createRecordIndexes(records: StructuredTripRecords) {
  const itemsByCanonicalId = new Map(records.items.map((item) => [item.canonicalId, item]));
  const staysByCanonicalId = new Map(records.stays.map((stay) => [stay.canonicalId, stay]));
  const transportByCanonicalId = new Map(
    records.transport.map((record) => [record.canonicalId, record])
  );
  if (
    itemsByCanonicalId.size !== records.items.length ||
    staysByCanonicalId.size !== records.stays.length ||
    transportByCanonicalId.size !== records.transport.length
  ) {
    throw new Error("Assembly decision ledger found duplicate final canonical ids.");
  }
  const itemByExactKey = new Map<string, TripItemRecord[]>();
  const noteByTitleKey = new Map<string, TripItemRecord[]>();
  for (const item of records.items) {
    addToMapArray(
      itemByExactKey,
      stableJsonStringify({ date: item.date, title: normalizeText(item.title) }),
      item
    );
    if (item.itemType === "note") {
      addToMapArray(noteByTitleKey, normalizeText(item.title), item);
    }
  }
  const stayByExactKey = new Map<string, TripStayRecord[]>();
  for (const stay of records.stays) {
    addToMapArray(
      stayByExactKey,
      stableJsonStringify({
        checkInDate: stay.checkInDate,
        name: normalizeText(stay.name),
      }),
      stay
    );
  }
  const transportByExactKey = new Map<string, TripTransportRecord[]>();
  for (const transport of records.transport) {
    addToMapArray(
      transportByExactKey,
      stableJsonStringify({
        date: transport.date,
        routeLabel: normalizeText(transport.routeLabel),
      }),
      transport
    );
  }
  const privateByKey = new Map<string, TripPrivateDetailRecord[]>();
  for (const detail of records.privateDetails) {
    addToMapArray(privateByKey, privateDetailKey(detail.detailType, detail.value), detail);
    if (normalizeText(detail.label) !== normalizeText(detail.value)) {
      addToMapArray(privateByKey, privateDetailKey(detail.detailType, detail.label), detail);
    }
  }
  const subjectTitleByCanonicalId = new Map<string, string>([
    ...records.items.map((item) => [item.canonicalId, item.title] as const),
    ...records.stays.map((stay) => [stay.canonicalId, stay.name] as const),
    ...records.transport.map(
      (transport) => [transport.canonicalId, transport.routeLabel] as const
    ),
    ...records.legs.map((leg) => [leg.canonicalId, leg.displayName] as const),
  ]);
  const reviewsByExactKey = new Map<string, TripReviewQuestionRecord[]>();
  const reviewsBySubjectKey = new Map<string, TripReviewQuestionRecord[]>();
  const reviewsByCanonicalId = new Map(
    records.reviewQuestions.map((review) => [review.canonicalId, review])
  );
  if (reviewsByCanonicalId.size !== records.reviewQuestions.length) {
    throw new Error("Assembly decision ledger found duplicate final review ids.");
  }
  for (const review of records.reviewQuestions) {
    addToMapArray(
      reviewsByExactKey,
      reviewExactKey(review.targetField, review.prompt),
      review
    );
    addToMapArray(
      reviewsBySubjectKey,
      reviewSubjectKey(
        review.targetField,
        subjectTitleByCanonicalId.get(review.subjectCanonicalId) ?? null
      ),
      review
    );
  }
  return {
    itemByExactKey,
    itemsByCanonicalId,
    legKeys: legKeyById(records),
    noteByTitleKey,
    privateByKey,
    reviewsByCanonicalId,
    reviewsByExactKey,
    reviewsBySubjectKey,
    staysByCanonicalId,
    stayByExactKey,
    subjectTitleByCanonicalId,
    transportByCanonicalId,
    transportByExactKey,
  };
}

function reviewCarrierAnchor(review: TripReviewQuestionRecord, factId: string) {
  return createCarrierAnchorHashV1({
    carrierClass: "review_item",
    context: {
      decisionAnchorDigest: review.decisionAnchor
        ? hashStableValue(review.decisionAnchor).slice(0, 40)
        : null,
      decisionId: hashStableValue({ canonicalId: review.canonicalId }).slice(0, 40),
    },
    sourceFactIds: [factId],
  });
}

function protectedCarrierAnchor({
  detail,
  factId,
}: {
  detail: TripPrivateDetailRecord;
  factId: string;
}) {
  return createCarrierAnchorHashV1({
    carrierClass: "protected_detail",
    context: {
      ownerCarrierAnchor: hashStableValue({
        subjectCanonicalId: detail.subjectCanonicalId,
        subjectType: detail.subjectType,
      }).slice(0, 40),
      protectedFieldClass: normalizeText(detail.detailType),
    },
    sourceFactIds: [factId],
  });
}

function uniqueValue<T>(values: readonly T[]) {
  return values.length === 1 ? values[0] : null;
}

function buildFactToPieceIds({
  descriptors,
  observations,
  pieces,
}: {
  descriptors: CandidateDescriptor[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  const observationIdsByCandidateId = new Map<string, string[]>();
  const observationIdsByJoinKey = new Map<string, string[]>();
  for (const observation of observations) {
    const candidateId = stringValue(observation.payload, "_resolverCandidateId");
    if (candidateId) addToMapArray(observationIdsByCandidateId, candidateId, observation.id);
    const recordClass = observationClass(observation);
    if (!recordClass) continue;
    addToMapArray(
      observationIdsByJoinKey,
      observationJoinKey({
        date: recordDate(observation.payload),
        recordClass,
        sourceLabel: observation.sourceLabel,
        sourceUploadId: observation.sourceUploadId,
        title: candidateTitle(observation.payload),
      }),
      observation.id
    );
  }
  const pieceIdsByObservationId = new Map<string, string[]>();
  const pieceIdsByCandidateId = new Map<string, string[]>();
  for (const piece of pieces) {
    for (const observationId of piece.observationIds) {
      addToMapArray(pieceIdsByObservationId, observationId, piece.id);
    }
    const candidateId = stringValue(piece.payload, "_resolverCandidateId");
    if (candidateId) addToMapArray(pieceIdsByCandidateId, candidateId, piece.id);
  }
  const pieceIdsByFactId = new Map<string, string[]>();
  for (const descriptor of descriptors) {
    if (!descriptor.factId) continue;
    const observationIds = descriptor.resolverCandidateId
      ? observationIdsByCandidateId.get(descriptor.resolverCandidateId) ?? []
      : observationIdsByJoinKey.get(
          observationJoinKey({
            date: recordDate(descriptor.record),
            recordClass: descriptor.recordClass,
            sourceLabel: descriptor.stage.label,
            sourceUploadId: descriptor.stage.sourceUploadId ?? null,
            title: candidateTitle(descriptor.record),
          })
        ) ?? [];
    const uniqueObservationIds = sortedUnique(observationIds);
    const pieceIds = [
      ...(descriptor.resolverCandidateId
        ? pieceIdsByCandidateId.get(descriptor.resolverCandidateId) ?? []
        : []),
      ...(uniqueObservationIds.length === 1
        ? pieceIdsByObservationId.get(uniqueObservationIds[0]) ?? []
        : []),
    ];
    for (const pieceId of sortedUnique(pieceIds)) {
      addToMapArray(pieceIdsByFactId, descriptor.factId, pieceId);
    }
  }
  return new Map(
    [...pieceIdsByFactId].map(([factId, pieceIds]) => [
      factId,
      sortedUnique(pieceIds),
    ])
  );
}

function terminalPiecesFor(
  piece: CanonicalEvidencePiece,
  pieceById: Map<string, CanonicalEvidencePiece>,
  pieceByPriorId: Map<string, CanonicalEvidencePiece>,
  visiting = new Set<string>()
): { pieces: CanonicalEvidencePiece[]; terminal: boolean; unresolved: boolean } {
  if (visiting.has(piece.id)) {
    throw new Error("Assembly decision ledger found a canonical disposition cycle.");
  }
  if (piece.outputEligible) return { pieces: [piece], terminal: false, unresolved: false };
  if (piece.disposition?.kind === "terminal") {
    return { pieces: [], terminal: true, unresolved: false };
  }
  const survivorIds =
    piece.disposition?.kind === "survivor"
      ? [piece.disposition.survivorId]
      : piece.disposition?.kind === "survivors"
        ? piece.disposition.survivorIds
        : [];
  if (survivorIds.length === 0) {
    return { pieces: [], terminal: false, unresolved: true };
  }
  const nextVisiting = new Set(visiting).add(piece.id);
  const outcomes = survivorIds.map((survivorId) => {
    const survivor = pieceById.get(survivorId) ?? pieceByPriorId.get(survivorId);
    if (!survivor) {
      throw new Error("Assembly decision ledger found a dangling survivor carrier.");
    }
    return terminalPiecesFor(survivor, pieceById, pieceByPriorId, nextVisiting);
  });
  return {
    pieces: outcomes.flatMap((outcome) => outcome.pieces),
    terminal: outcomes.every((outcome) => outcome.terminal),
    unresolved: outcomes.some((outcome) => outcome.unresolved),
  };
}

function carrierForPiece({
  factId,
  piece,
  recordIndexes,
}: {
  factId: string;
  piece: CanonicalEvidencePiece;
  recordIndexes: ReturnType<typeof createRecordIndexes>;
}): CarrierTarget | null {
  const item = recordIndexes.itemsByCanonicalId.get(piece.id);
  if (item) return anchorForItem(item, factId, recordIndexes.legKeys);
  const stay = recordIndexes.staysByCanonicalId.get(piece.id);
  if (stay) return anchorForStay(stay, factId, recordIndexes.legKeys);
  const transport = recordIndexes.transportByCanonicalId.get(piece.id);
  if (transport) return anchorForTransport(transport, factId, recordIndexes.legKeys);
  if (
    piece.outputEligible &&
    (piece.kind === "activity" ||
      piece.kind === "note" ||
      piece.kind === "stay" ||
      piece.kind === "transport")
  ) {
    throw new Error("Assembly decision ledger detected a later-stage carrier deletion.");
  }
  return null;
}

function fallbackCarrierForDescriptor({
  descriptor,
  factId,
  recordIndexes,
  sourceCarrierClasses,
}: {
  descriptor: CandidateDescriptor;
  factId: string;
  recordIndexes: ReturnType<typeof createRecordIndexes>;
  sourceCarrierClasses: Set<string>;
}): CarrierTarget | null {
  if (descriptor.recordClass === "activity") {
    const exact = recordIndexes.itemByExactKey.get(
      stableJsonStringify({
        date: stringValue(descriptor.record, "date"),
        title: normalizeText(candidateTitle(descriptor.record)),
      })
    ) ?? [];
    const exactItem = uniqueValue(exact);
    if (exactItem) return anchorForItem(exactItem, factId, recordIndexes.legKeys);
    if (sourceCarrierClasses.has("city_note")) {
      const note = uniqueValue(
        recordIndexes.noteByTitleKey.get(normalizeText(candidateTitle(descriptor.record))) ?? []
      );
      if (note) return anchorForItem(note, factId, recordIndexes.legKeys);
    }
  }
  if (descriptor.recordClass === "stay") {
    const stay = uniqueValue(
      recordIndexes.stayByExactKey.get(
        stableJsonStringify({
          checkInDate:
            stringValue(descriptor.record, "checkIn") ??
            stringValue(descriptor.record, "checkInDate") ??
            stringValue(descriptor.record, "firstNightDate"),
          name: normalizeText(candidateTitle(descriptor.record)),
        })
      ) ?? []
    );
    if (stay) return anchorForStay(stay, factId, recordIndexes.legKeys);
  }
  if (descriptor.recordClass === "transport") {
    const transport = uniqueValue(
      recordIndexes.transportByExactKey.get(
        stableJsonStringify({
          date: stringValue(descriptor.record, "date"),
          routeLabel: normalizeText(candidateTitle(descriptor.record)),
        })
      ) ?? []
    );
    if (transport) {
      return anchorForTransport(transport, factId, recordIndexes.legKeys);
    }
  }
  if (descriptor.recordClass === "protected_detail") {
    const detailType = stringValue(descriptor.record, "detailType") ?? "sensitive_detail";
    const value =
      stringValue(descriptor.record, "value") ?? candidateTitle(descriptor.record);
    const detail = uniqueValue(
      recordIndexes.privateByKey.get(privateDetailKey(detailType, value)) ?? []
    );
    if (detail) {
      return {
        anchorHash: protectedCarrierAnchor({ detail, factId }),
        canonicalId: detail.id,
        carrierClass: "protected_detail",
        parentItemId: null,
      };
    }
  }
  return null;
}

function resolveEntities({
  descriptorsByFactId,
  factToPieceIds,
  pieces,
  records,
  sourceLedger,
}: {
  descriptorsByFactId: Map<string, CandidateDescriptor[]>;
  factToPieceIds: Map<string, string[]>;
  pieces: CanonicalEvidencePiece[];
  records: StructuredTripRecords;
  sourceLedger: SourceFactLedgerBuildResultV1;
}) {
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const pieceByPriorId = new Map<string, CanonicalEvidencePiece>();
  for (const piece of pieces) {
    const priorIds = Array.isArray(piece.payload._canonicalPriorPieceIds)
      ? piece.payload._canonicalPriorPieceIds.filter(
          (value): value is string => typeof value === "string" && Boolean(value)
        )
      : [];
    for (const priorId of priorIds) {
      const existing = pieceByPriorId.get(priorId);
      if (existing && existing.id !== piece.id) {
        throw new Error("Assembly decision ledger found ambiguous prior-id forwarding.");
      }
      pieceByPriorId.set(priorId, piece);
    }
  }
  const recordIndexes = createRecordIndexes(records);
  const sourceCarrierClassesByFactId = new Map<string, Set<string>>();
  for (const edge of sourceLedger.factSet.carrierEdges) {
    const values = sourceCarrierClassesByFactId.get(edge.factId) ?? new Set<string>();
    values.add(edge.carrierClass);
    sourceCarrierClassesByFactId.set(edge.factId, values);
  }
  const result = new Map<string, EntityResolution>();
  for (const fact of sourceLedger.factSet.facts.filter((fact) => fact.kind === "entity")) {
    const terminalPieces = (factToPieceIds.get(fact.factId) ?? []).map((pieceId) => {
      const piece = pieceById.get(pieceId);
      if (!piece) throw new Error("Assembly decision ledger found a dangling fact piece.");
      return terminalPiecesFor(piece, pieceById, pieceByPriorId);
    });
    const carrierTargets = terminalPieces.flatMap((outcome) =>
      outcome.pieces.flatMap((piece) => {
        const carrier = carrierForPiece({ factId: fact.factId, piece, recordIndexes });
        return carrier ? [carrier] : [];
      })
    );
    if (carrierTargets.length === 0) {
      for (const descriptor of descriptorsByFactId.get(fact.factId) ?? []) {
        const carrier = fallbackCarrierForDescriptor({
          descriptor,
          factId: fact.factId,
          recordIndexes,
          sourceCarrierClasses: sourceCarrierClassesByFactId.get(fact.factId) ?? new Set(),
        });
        if (carrier) carrierTargets.push(carrier);
      }
    }
    const uniqueTargets = [...new Map(
      carrierTargets.map((target) => [`${target.carrierClass}:${target.canonicalId}`, target])
    ).values()];
    if (uniqueTargets.length === 1) {
      result.set(fact.factId, {
        carrierTargets: uniqueTargets,
        outcome: "carried",
        reasonCode: "verified_terminal_carrier",
      });
      continue;
    }
    if (uniqueTargets.length > 1) {
      result.set(fact.factId, {
        carrierTargets: [],
        outcome: "unresolved",
        reasonCode: "ambiguous_multiple_terminal_carriers",
      });
      continue;
    }
    const carrierClasses = sourceCarrierClassesByFactId.get(fact.factId) ?? new Set();
    const explicitlyContextOnly =
      carrierClasses.size > 0 &&
      [...carrierClasses].every((value) => value === "context_only");
    const onlyTerminalPieces =
      terminalPieces.length > 0 &&
      terminalPieces.every((outcome) => outcome.terminal && !outcome.unresolved);
    if (
      explicitlyContextOnly ||
      onlyTerminalPieces ||
      stringValue(fact.payload, "recordClass") === "place"
    ) {
      result.set(fact.factId, {
        carrierTargets: [],
        outcome: "evidence_only",
        reasonCode: explicitlyContextOnly
          ? "source_context_only"
          : onlyTerminalPieces
            ? "explicit_terminal_disposal"
            : "structural_place_evidence",
      });
    } else {
      result.set(fact.factId, {
        carrierTargets: [],
        outcome: "unresolved",
        reasonCode: "source_fact_has_no_unique_terminal_carrier",
      });
    }
  }
  return { entityResolutions: result, recordIndexes };
}

function relationshipResolutionFor({
  entityResolutions,
  fact,
  recordIndexes,
}: {
  entityResolutions: Map<string, EntityResolution>;
  fact: SourceFactV1;
  recordIndexes: ReturnType<typeof createRecordIndexes>;
}): RelationshipResolution {
  const status = stringValue(fact.payload, "status");
  if (status === "rejected") {
    return { carrierAnchorHashes: [], outcome: "rejected", reasonCode: "source_relationship_rejected" };
  }
  if (status === "source_declared_section_context") {
    return { carrierAnchorHashes: [], outcome: "applied", reasonCode: "source_section_context_observed" };
  }
  const memberFactIds = arrayStrings(fact.payload.memberFactIds);
  const parentFactId = stringValue(fact.payload, "parentFactId");
  const memberTargets = memberFactIds.flatMap(
    (factId) => entityResolutions.get(factId)?.carrierTargets ?? []
  );
  const memberItems = memberTargets.flatMap((target) => {
    const item = recordIndexes.itemsByCanonicalId.get(target.canonicalId);
    return item ? [item] : [];
  });
  const parentCanonicalIds = parentFactId
    ? (entityResolutions.get(parentFactId)?.carrierTargets ?? []).map(
        (target) => target.canonicalId
      )
    : [];
  const sharedParentCounts = new Map<string, number>();
  for (const item of memberItems) {
    if (item.parentItemId) {
      sharedParentCounts.set(item.parentItemId, (sharedParentCounts.get(item.parentItemId) ?? 0) + 1);
    }
  }
  const appliedByDeclaredParent =
    parentCanonicalIds.length === 1 &&
    memberItems.length >= 1 &&
    memberItems.every(
      (item) =>
        item.canonicalId === parentCanonicalIds[0] ||
        item.parentItemId === parentCanonicalIds[0]
    );
  const appliedBySharedParent = [...sharedParentCounts.values()].some(
    (count) => count >= 2
  );
  const allMembersCarried =
    memberFactIds.length > 0 &&
    memberFactIds.every(
      (factId) => entityResolutions.get(factId)?.outcome === "carried"
    );
  if (allMembersCarried && (appliedByDeclaredParent || appliedBySharedParent)) {
    return {
      carrierAnchorHashes: sortedUnique(memberTargets.map((target) => target.anchorHash)),
      outcome: "applied",
      reasonCode: "verified_group_projection",
    };
  }
  if (status === "accepted") {
    return {
      carrierAnchorHashes: [],
      outcome: "rejected",
      reasonCode: "accepted_relationship_not_projected",
    };
  }
  return {
    carrierAnchorHashes: [],
    outcome: "unresolved",
    reasonCode:
      memberFactIds.length === 0
        ? "relationship_has_no_bound_members"
        : "relationship_not_terminally_projected",
  };
}

function reviewForDescriptor(
  descriptor: CandidateDescriptor,
  indexes: ReturnType<typeof createRecordIndexes>
) {
  const targetField = stringValue(descriptor.record, "targetField");
  const exact = indexes.reviewsByExactKey.get(
    reviewExactKey(targetField, stringValue(descriptor.record, "prompt"))
  ) ?? [];
  if (exact.length === 1) return exact[0];
  const subject = indexes.reviewsBySubjectKey.get(
    reviewSubjectKey(
      targetField,
      stringValue(descriptor.record, "relatedTitle") ?? candidateTitle(descriptor.record)
    )
  ) ?? [];
  return uniqueValue(subject);
}

function addDecision(
  decisions: AssemblyDecisionV1[],
  input: Omit<AssemblyDecisionV1, "decisionId" | "writerVersion">
) {
  const normalized = {
    ...input,
    inputDecisionIds: sortedUnique(input.inputDecisionIds),
    subjectFactIds: sortedUnique(input.subjectFactIds),
    unresolvedSourceSpanIds: sortedUnique(input.unresolvedSourceSpanIds),
  };
  const decision: AssemblyDecisionV1 = {
    ...normalized,
    decisionId: createAssemblyDecisionIdV1(normalized),
    writerVersion: ASSEMBLY_DECISION_WRITER_VERSION,
  };
  decisions.push(decision);
  return decision.decisionId;
}

function appliedResolverFacts(evaluations: ResolverRoleEvaluationV1[]) {
  return new Set(
    evaluations
      .filter((evaluation) => evaluation.reconciliationOutcome === "applied")
      .flatMap((evaluation) => evaluation.subjectFactIds)
  );
}

export function buildAssemblyDecisionCarrierLedgerV1({
  index,
  observations,
  pieces,
  records,
  recoverySourceBindings = null,
  resolverMetadata = null,
  sourceLedger,
  stages,
}: {
  index: SourceDocumentIndexV1;
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
  records: StructuredTripRecords;
  recoverySourceBindings?: RecoverySourceBindingSidecarV1 | null;
  resolverMetadata?: CanonicalEvidenceResolverMetadata | null;
  sourceLedger: SourceFactLedgerBuildResultV1;
  stages: EvidenceStageInput[];
}): AssemblyDecisionCarrierBuildResultV1 {
  const startedAt = performance.now();
  if (index.sourceFingerprint !== sourceLedger.factSet.sourceFingerprint) {
    throw new Error("Assembly decision ledger received the wrong source index.");
  }
  const descriptors = candidateDescriptors({
    index,
    sourceFacts: sourceLedger.factSet.facts,
    stages,
  });
  const descriptorsByFactId = new Map<string, CandidateDescriptor[]>();
  for (const descriptor of descriptors) {
    if (descriptor.factId) addToMapArray(descriptorsByFactId, descriptor.factId, descriptor);
  }
  const resolverRoleEvaluations = buildResolverEvaluations({
    descriptors,
    recoverySourceBindings,
    resolverMetadata,
  });
  const factToPieceIds = buildFactToPieceIds({ descriptors, observations, pieces });
  const { entityResolutions, recordIndexes } = resolveEntities({
    descriptorsByFactId,
    factToPieceIds,
    pieces,
    records,
    sourceLedger,
  });
  const resolverFactIds = appliedResolverFacts(resolverRoleEvaluations);
  const decisions: AssemblyDecisionV1[] = [];
  const decisionIdsByFactId = new Map<string, string[]>();
  const lastDecisionIdByFactId = new Map<string, string>();
  const classificationDecisionIdByFactId = new Map<string, string>();
  const terminalByFactId = new Map<
    string,
    Omit<FactTerminalDispositionV1, "decisionIds" | "factId" | "factKind">
  >();
  const addFactDecision = ({
    applied,
    domain,
    fact,
    inputDecisionIds = [],
    outcomeCode,
    producer = "deterministic_assembly",
    subjectFactIds = [fact.factId],
    unresolvedSourceSpanIds = [],
  }: {
    applied: boolean;
    domain: AssemblyDecisionDomainV1;
    fact: SourceFactV1;
    inputDecisionIds?: string[];
    outcomeCode: string;
    producer?: AssemblyDecisionProducerV1;
    subjectFactIds?: string[];
    unresolvedSourceSpanIds?: string[];
  }) => {
    const decisionId = addDecision(decisions, {
      applied,
      domain,
      inputDecisionIds,
      outcomeCode,
      producer,
      subjectFactIds,
      unresolvedSourceSpanIds,
    });
    addToMapArray(decisionIdsByFactId, fact.factId, decisionId);
    lastDecisionIdByFactId.set(fact.factId, decisionId);
    return decisionId;
  };

  for (const fact of sourceLedger.factSet.facts) {
    if (fact.kind === "entity") {
      const resolution = entityResolutions.get(fact.factId)!;
      const classificationId = addFactDecision({
        applied: resolution.outcome !== "unresolved",
        domain: "classification",
        fact,
        outcomeCode:
          resolution.outcome === "carried"
            ? `classified_${resolution.carrierTargets[0].carrierClass}`
            : resolution.outcome === "evidence_only"
              ? "classified_evidence_only"
              : "classification_unresolved",
        producer: resolverFactIds.has(fact.factId)
          ? "resolver"
          : "deterministic_assembly",
        unresolvedSourceSpanIds:
          resolution.outcome === "unresolved" ? fact.sourceSpanIds : [],
      });
      classificationDecisionIdByFactId.set(fact.factId, classificationId);
      addFactDecision({
        applied: resolution.outcome !== "unresolved",
        domain: "identity",
        fact,
        inputDecisionIds: [classificationId],
        outcomeCode:
          resolution.outcome === "carried"
            ? "identity_survived"
            : resolution.outcome === "evidence_only"
              ? "identity_terminal_evidence_only"
              : "identity_unresolved",
        unresolvedSourceSpanIds:
          resolution.outcome === "unresolved" ? fact.sourceSpanIds : [],
      });
      terminalByFactId.set(fact.factId, {
        carrierAnchorHashes: resolution.carrierTargets.map(
          (target) => target.anchorHash
        ),
        outcome: resolution.outcome,
        reasonCode: resolution.reasonCode,
      });
      continue;
    }

    if (fact.kind === "relationship") {
      const resolution = relationshipResolutionFor({
        entityResolutions,
        fact,
        recordIndexes,
      });
      const containmentId = addFactDecision({
        applied: resolution.outcome !== "unresolved",
        domain: "containment",
        fact,
        outcomeCode: `containment_${resolution.outcome}`,
        producer: fact.producer === "resolver" ? "resolver" : "deterministic_assembly",
        unresolvedSourceSpanIds:
          resolution.outcome === "unresolved" ? fact.sourceSpanIds : [],
      });
      addFactDecision({
        applied: resolution.outcome === "applied",
        domain: "grouping",
        fact,
        inputDecisionIds: [containmentId],
        outcomeCode: `grouping_${resolution.outcome}`,
        producer: fact.producer === "resolver" ? "resolver" : "deterministic_assembly",
        unresolvedSourceSpanIds:
          resolution.outcome === "unresolved" ? fact.sourceSpanIds : [],
      });
      terminalByFactId.set(fact.factId, resolution);
      continue;
    }

    if (fact.kind === "intent") {
      const subjectFactId = stringValue(fact.payload, "subjectFactId");
      const subject = subjectFactId ? entityResolutions.get(subjectFactId) : null;
      const intent = stringValue(fact.payload, "intent");
      const carrierClass = subject?.carrierTargets[0]?.carrierClass ?? null;
      const applied =
        subject?.outcome === "carried" &&
        ((intent === "uncertain" && carrierClass === "city_note") ||
          (intent === "committed" && carrierClass !== "city_note"));
      const outcome = !subject || subject.outcome === "unresolved"
        ? "unresolved"
        : applied
          ? "applied"
          : "superseded";
      addFactDecision({
        applied: outcome !== "unresolved",
        domain: "classification",
        fact,
        inputDecisionIds: subjectFactId
          ? [classificationDecisionIdByFactId.get(subjectFactId)].filter(
              (value): value is string => Boolean(value)
            )
          : [],
        outcomeCode: `intent_${outcome}`,
        subjectFactIds: sortedUnique(
          [fact.factId, subjectFactId].filter(
            (value): value is string => Boolean(value)
          )
        ),
        unresolvedSourceSpanIds: outcome === "unresolved" ? fact.sourceSpanIds : [],
      });
      terminalByFactId.set(fact.factId, {
        carrierAnchorHashes: subject?.carrierTargets.map(
          (target) => target.anchorHash
        ) ?? [],
        outcome,
        reasonCode:
          outcome === "applied"
            ? "intent_matches_terminal_carrier"
            : outcome === "superseded"
              ? "intent_superseded_by_terminal_classification"
              : "intent_subject_unresolved",
      });
      continue;
    }

    if (fact.kind === "decision") {
      const reviews = sortedUnique(
        (descriptorsByFactId.get(fact.factId) ?? []).flatMap((descriptor) => {
          const review = reviewForDescriptor(descriptor, recordIndexes);
          return review ? [review.canonicalId] : [];
        })
      ).flatMap((canonicalId) => {
        const review = recordIndexes.reviewsByCanonicalId.get(canonicalId);
        return review ? [review] : [];
      });
      const review = uniqueValue(reviews);
      const outcome = !review
        ? "unresolved"
        : review.status === "dismissed"
          ? "dismissed"
          : review.status === "answered"
            ? "resolved_silently"
            : "review";
      addFactDecision({
        applied: outcome !== "unresolved",
        domain: "review",
        fact,
        outcomeCode: `review_${outcome}`,
        unresolvedSourceSpanIds: outcome === "unresolved" ? fact.sourceSpanIds : [],
      });
      terminalByFactId.set(fact.factId, {
        carrierAnchorHashes: review ? [reviewCarrierAnchor(review, fact.factId)] : [],
        outcome,
        reasonCode: review
          ? `terminal_review_${review.status}`
          : "source_decision_has_no_unique_review_carrier",
      });
      continue;
    }

    terminalByFactId.set(fact.factId, {
      carrierAnchorHashes: [],
      outcome: "excluded",
      reasonCode: stringValue(fact.payload, "exclusionCode") ?? "source_exclusion",
    });
  }

  const factDispositions: FactTerminalDispositionV1[] = [];
  for (const fact of sourceLedger.factSet.facts) {
    const terminal = terminalByFactId.get(fact.factId);
    if (!terminal) throw new Error("Assembly decision ledger missed a source fact.");
    const priorDecisionId = lastDecisionIdByFactId.get(fact.factId);
    const publishDecisionId = addFactDecision({
      applied: terminal.outcome !== "unresolved",
      domain: "publish_projection",
      fact,
      inputDecisionIds: priorDecisionId ? [priorDecisionId] : [],
      outcomeCode: `publish_${fact.kind}_${terminal.outcome}`,
      unresolvedSourceSpanIds:
        terminal.outcome === "unresolved" ? fact.sourceSpanIds : [],
    });
    const base = {
      carrierAnchorHashes: sortedUnique(terminal.carrierAnchorHashes),
      decisionIds: sortedUnique(decisionIdsByFactId.get(fact.factId) ?? [publishDecisionId]),
      factId: fact.factId,
      reasonCode: terminal.reasonCode,
    };
    if (fact.kind === "entity") {
      factDispositions.push({ ...base, factKind: fact.kind, outcome: terminal.outcome as "carried" | "evidence_only" | "unresolved" });
    } else if (fact.kind === "relationship") {
      factDispositions.push({ ...base, factKind: fact.kind, outcome: terminal.outcome as "applied" | "rejected" | "unresolved" });
    } else if (fact.kind === "intent") {
      factDispositions.push({ ...base, factKind: fact.kind, outcome: terminal.outcome as "applied" | "superseded" | "unresolved" });
    } else if (fact.kind === "decision") {
      factDispositions.push({ ...base, factKind: fact.kind, outcome: terminal.outcome as "review" | "resolved_silently" | "dismissed" | "unresolved" });
    } else {
      factDispositions.push({
        ...base,
        carrierAnchorHashes: [],
        factKind: fact.kind,
        outcome: "excluded",
      });
    }
  }

  decisions.sort((left, right) => left.decisionId.localeCompare(right.decisionId));
  factDispositions.sort((left, right) => left.factId.localeCompare(right.factId));
  return finalizeAssemblyDecisionCarrierSetV1({
    decisionSet: {
      decisions,
      factDispositions,
      resolverRoleEvaluations,
      schemaVersion: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
      sourceFactLedgerHash: sourceLedger.metrics.ledgerHash,
      sourceFactLedgerSchemaVersion: sourceLedger.factSet.schemaVersion,
      sourceFingerprint: sourceLedger.factSet.sourceFingerprint,
    },
    ledgerBuildMilliseconds: performance.now() - startedAt,
    sourceFactSet: sourceLedger.factSet,
  });
}
