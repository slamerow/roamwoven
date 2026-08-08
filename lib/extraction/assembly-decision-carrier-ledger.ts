import {
  hashStableValue,
  stableJsonStringify,
} from "@/lib/extraction/source-document-index";
import type {
  SourceFactKindV1,
  SourceFactSetV1,
} from "@/lib/extraction/source-fact-ledger";

export const ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION = 1 as const;
export const ASSEMBLY_DECISION_WRITER_VERSION = 1 as const;
export const ASSEMBLY_DECISION_LEDGER_MAX_BYTES = 1024 * 1024;

export type AssemblyDecisionDomainV1 =
  | "classification"
  | "containment"
  | "identity"
  | "grouping"
  | "review"
  | "publish_projection";

export type AssemblyDecisionProducerV1 =
  | "resolver"
  | "deterministic_assembly";

export type ResolverSourceLaneV1 = "spine" | "chunk" | "recovery";

export type ResolverRoleRejectionCodeV1 =
  | "low_confidence"
  | "conflicting_classification"
  | "unknown_candidate"
  | "duplicate_proposal";

export type ResolverRoleEvaluationV1 = {
  evaluationId: string;
  proposedRole: "city_note" | "keep_activity";
  confidence: "high" | "medium" | "low";
  reconciliationOutcome: "applied" | "supporting" | "rejected";
  rejectionCodes: ResolverRoleRejectionCodeV1[];
  reasonDigest: string;
  subjectFactIds: string[];
  unresolvedSourceSpanIds: string[];
  sourceLane: ResolverSourceLaneV1;
};

export type ResolverRoleEvaluationBindingStatusV1 =
  | "source_fact"
  | "source_span"
  | "unresolved";

export type AssemblyDecisionV1 = {
  decisionId: string;
  domain: AssemblyDecisionDomainV1;
  producer: AssemblyDecisionProducerV1;
  subjectFactIds: string[];
  unresolvedSourceSpanIds: string[];
  inputDecisionIds: string[];
  outcomeCode: string;
  applied: boolean;
  writerVersion: typeof ASSEMBLY_DECISION_WRITER_VERSION;
};

type FactTerminalDispositionBaseV1 = {
  factId: string;
  carrierAnchorHashes: string[];
  decisionIds: string[];
  reasonCode: string;
};

export type FactTerminalDispositionV1 =
  | (FactTerminalDispositionBaseV1 & {
      factKind: "entity";
      outcome: "carried" | "evidence_only" | "unresolved";
    })
  | (FactTerminalDispositionBaseV1 & {
      factKind: "relationship";
      outcome: "applied" | "rejected" | "unresolved";
    })
  | (FactTerminalDispositionBaseV1 & {
      factKind: "intent";
      outcome: "applied" | "superseded" | "unresolved";
    })
  | (FactTerminalDispositionBaseV1 & {
      factKind: "decision";
      outcome: "review" | "resolved_silently" | "dismissed" | "unresolved";
    })
  | (FactTerminalDispositionBaseV1 & {
      factKind: "exclusion";
      outcome: "excluded";
      carrierAnchorHashes: [];
    });

export type AssemblyDecisionCarrierSetV1 = {
  schemaVersion: typeof ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION;
  sourceFactLedgerSchemaVersion: 1;
  sourceFactLedgerHash: string;
  sourceFingerprint: string;
  resolverRoleEvaluations: ResolverRoleEvaluationV1[];
  decisions: AssemblyDecisionV1[];
  factDispositions: FactTerminalDispositionV1[];
};

export type AssemblyDecisionLedgerMetricsV1 = {
  schemaVersion: typeof ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION;
  writerVersion: typeof ASSEMBLY_DECISION_WRITER_VERSION;
  decisionSetHash: string;
  resolverEvaluationCount: number;
  decisionCount: number;
  factDispositionCount: number;
  serializedByteSize: number;
  ledgerBuildMilliseconds: number;
};

export type AssemblyDecisionCarrierBuildResultV1 = {
  decisionSet: AssemblyDecisionCarrierSetV1;
  metrics: AssemblyDecisionLedgerMetricsV1;
};

export const ASSEMBLY_DECISION_DOMAINS_V1 = [
  "classification",
  "containment",
  "identity",
  "grouping",
  "review",
  "publish_projection",
] as const satisfies readonly AssemblyDecisionDomainV1[];

export const ASSEMBLY_DECISION_TELEMETRY_ALLOWLIST_V1 = [
  "additionalGeocodingLookupCount",
  "additionalModelCallCount",
  "additionalRetryCount",
  "ambiguousCount",
  "buildMilliseconds",
  "byteSize",
  "countsByDecisionDomain",
  "countsByDisposition",
  "countsByProducer",
  "countsByReconciliationOutcome",
  "countsByRejectionCode",
  "countsBySourceLane",
  "decisionSetHash",
  "outputFingerprintAfter",
  "outputFingerprintBefore",
  "schemaVersion",
  "sourceFactLedgerHash",
  "unresolvedCount",
  "writerVersion",
] as const;

export const LOOP9_AUDIT_BASELINES_V1 = {
  candidate86: {
    acceptedRoleDecisionCount: 161,
    behaviorBearingRoleDecisionCount: 18,
    rawRoleProposalCount: 223,
    resolverCallCount: 30,
  },
  fresh87: {
    acceptedRoleDecisionCount: 113,
    behaviorBearingRoleDecisionCount: 5,
    rawRoleProposalCount: 150,
    resolverCallCount: 30,
  },
} as const;

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

export function digestResolverReasonV1(reason: string) {
  return hashStableValue({ reason }).slice(0, 40);
}

/**
 * The persisted arrays encode one of three mutually exclusive binding states.
 * Keeping this derived avoids a redundant field that could drift from the
 * actual references while still making a no-safe-reference outcome explicit.
 */
export function resolverRoleEvaluationBindingStatusV1(
  evaluation: Pick<
    ResolverRoleEvaluationV1,
    "subjectFactIds" | "unresolvedSourceSpanIds"
  >
): ResolverRoleEvaluationBindingStatusV1 {
  if (
    evaluation.subjectFactIds.length > 0 &&
    evaluation.unresolvedSourceSpanIds.length > 0
  ) {
    throw new Error(
      "Assembly decision resolver evaluation mixes fact and unresolved-span bindings."
    );
  }
  if (evaluation.subjectFactIds.length > 0) return "source_fact";
  if (evaluation.unresolvedSourceSpanIds.length > 0) return "source_span";
  return "unresolved";
}

export function createResolverRoleEvaluationIdV1({
  confidence,
  duplicateOrdinal,
  indistinguishableOccurrenceOrdinal = 0,
  proposedRole,
  reasonDigest,
  reconciliationOutcome,
  rejectionCodes,
  sourceLane,
  stableWindowDigest,
  subjectFactIds,
  unresolvedSourceSpanIds,
}: Omit<ResolverRoleEvaluationV1, "evaluationId"> & {
  duplicateOrdinal: number;
  indistinguishableOccurrenceOrdinal?: number;
  stableWindowDigest: string;
}) {
  return `evaluation_${hashStableValue({
    confidence,
    duplicateOrdinal,
    indistinguishableOccurrenceOrdinal,
    proposedRole,
    reasonDigest,
    reconciliationOutcome,
    rejectionCodes: sortedUnique(rejectionCodes),
    schemaVersion: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
    sourceLane,
    stableWindowDigest,
    subjectFactIds: sortedUnique(subjectFactIds),
    unresolvedSourceSpanIds: sortedUnique(unresolvedSourceSpanIds),
  }).slice(0, 24)}`;
}

export function createAssemblyDecisionIdV1({
  applied,
  domain,
  inputDecisionIds,
  outcomeCode,
  producer,
  subjectFactIds,
  unresolvedSourceSpanIds,
  writerVersion = ASSEMBLY_DECISION_WRITER_VERSION,
}: Omit<AssemblyDecisionV1, "decisionId" | "writerVersion"> & {
  writerVersion?: typeof ASSEMBLY_DECISION_WRITER_VERSION;
}) {
  return `decision_${hashStableValue({
    applied,
    domain,
    inputDecisionIds: sortedUnique(inputDecisionIds),
    outcomeCode,
    producer,
    schemaVersion: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
    subjectFactIds: sortedUnique(subjectFactIds),
    unresolvedSourceSpanIds: sortedUnique(unresolvedSourceSpanIds),
    writerVersion,
  }).slice(0, 24)}`;
}

export type CarrierAnchorClassV1 =
  | "activity"
  | "city_note"
  | "stay"
  | "transport"
  | "protected_detail"
  | "review_item";

export function createCarrierAnchorHashV1({
  carrierClass,
  context,
  sourceFactIds,
}: {
  carrierClass: CarrierAnchorClassV1;
  context: Record<string, string | null>;
  sourceFactIds: string[];
}) {
  return `carrier_${hashStableValue({
    carrierClass,
    context,
    sourceFactIds: sortedUnique(sourceFactIds),
    version: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
  }).slice(0, 32)}`;
}

function assertHashOnlyAnchor(value: string) {
  if (!/^carrier_[a-f0-9]{32}$/.test(value)) {
    throw new Error("Assembly decision ledger contains a non-hash carrier anchor.");
  }
}

const ENTITY_OUTCOMES = new Set(["carried", "evidence_only", "unresolved"]);
const RELATIONSHIP_OUTCOMES = new Set(["applied", "rejected", "unresolved"]);
const INTENT_OUTCOMES = new Set(["applied", "superseded", "unresolved"]);
const DECISION_OUTCOMES = new Set([
  "review",
  "resolved_silently",
  "dismissed",
  "unresolved",
]);

export function assertAssemblyDecisionCarrierSetV1({
  decisionSet,
  sourceFactSet,
}: {
  decisionSet: AssemblyDecisionCarrierSetV1;
  sourceFactSet: SourceFactSetV1;
}) {
  if (
    decisionSet.schemaVersion !==
      ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION ||
    decisionSet.sourceFactLedgerSchemaVersion !== sourceFactSet.schemaVersion ||
    decisionSet.sourceFingerprint !== sourceFactSet.sourceFingerprint
  ) {
    throw new Error("Assembly decision ledger dependency metadata is invalid.");
  }
  if (decisionSet.sourceFactLedgerHash !== hashStableValue(sourceFactSet)) {
    throw new Error("Assembly decision ledger source-fact hash is invalid.");
  }

  const factById = new Map(sourceFactSet.facts.map((fact) => [fact.factId, fact]));
  const domainOrdinal = new Map(
    ASSEMBLY_DECISION_DOMAINS_V1.map((domain, index) => [domain, index])
  );
  const decisionIds = new Set<string>();
  const decisionById = new Map<string, AssemblyDecisionV1>();
  for (const decision of decisionSet.decisions) {
    if (decisionIds.has(decision.decisionId)) {
      throw new Error("Assembly decision ledger contains a duplicate decision id.");
    }
    decisionIds.add(decision.decisionId);
    decisionById.set(decision.decisionId, decision);
    if (!ASSEMBLY_DECISION_DOMAINS_V1.includes(decision.domain)) {
      throw new Error("Assembly decision ledger contains an unknown decision domain.");
    }
    if (decision.writerVersion !== ASSEMBLY_DECISION_WRITER_VERSION) {
      throw new Error("Assembly decision ledger contains an unknown writer version.");
    }
    if (
      decision.decisionId !==
      createAssemblyDecisionIdV1({
        applied: decision.applied,
        domain: decision.domain,
        inputDecisionIds: decision.inputDecisionIds,
        outcomeCode: decision.outcomeCode,
        producer: decision.producer,
        subjectFactIds: decision.subjectFactIds,
        unresolvedSourceSpanIds: decision.unresolvedSourceSpanIds,
        writerVersion: decision.writerVersion,
      })
    ) {
      throw new Error("Assembly decision ledger contains an invalid decision id.");
    }
    for (const factId of decision.subjectFactIds) {
      if (!factById.has(factId)) {
        throw new Error("Assembly decision ledger contains a dangling subject fact.");
      }
    }
  }
  for (const decision of decisionSet.decisions) {
    for (const inputDecisionId of decision.inputDecisionIds) {
      const input = decisionById.get(inputDecisionId);
      if (!input) {
        throw new Error("Assembly decision ledger contains a dangling input decision.");
      }
      if (
        (domainOrdinal.get(input.domain) ?? Number.MAX_SAFE_INTEGER) >
        (domainOrdinal.get(decision.domain) ?? -1)
      ) {
        throw new Error("Assembly decision ledger contains a backwards decision edge.");
      }
    }
  }

  const evaluationIds = new Set<string>();
  for (const evaluation of decisionSet.resolverRoleEvaluations) {
    if (evaluationIds.has(evaluation.evaluationId)) {
      throw new Error("Assembly decision ledger contains a duplicate evaluation id.");
    }
    evaluationIds.add(evaluation.evaluationId);
    resolverRoleEvaluationBindingStatusV1(evaluation);
    for (const factId of evaluation.subjectFactIds) {
      if (!factById.has(factId)) {
        throw new Error("Assembly decision ledger contains a dangling evaluation fact.");
      }
    }
  }

  const dispositionsByFactId = new Map<string, FactTerminalDispositionV1[]>();
  for (const disposition of decisionSet.factDispositions) {
    dispositionsByFactId.set(disposition.factId, [
      ...(dispositionsByFactId.get(disposition.factId) ?? []),
      disposition,
    ]);
    const fact = factById.get(disposition.factId);
    if (!fact || fact.kind !== disposition.factKind) {
      throw new Error("Assembly decision ledger contains a mistyped fact disposition.");
    }
    disposition.carrierAnchorHashes.forEach(assertHashOnlyAnchor);
    for (const decisionId of disposition.decisionIds) {
      if (!decisionIds.has(decisionId)) {
        throw new Error("Assembly decision ledger contains a dangling disposition decision.");
      }
    }
    const validOutcome =
      (disposition.factKind === "entity" &&
        ENTITY_OUTCOMES.has(disposition.outcome)) ||
      (disposition.factKind === "relationship" &&
        RELATIONSHIP_OUTCOMES.has(disposition.outcome)) ||
      (disposition.factKind === "intent" &&
        INTENT_OUTCOMES.has(disposition.outcome)) ||
      (disposition.factKind === "decision" &&
        DECISION_OUTCOMES.has(disposition.outcome)) ||
      (disposition.factKind === "exclusion" &&
        disposition.outcome === "excluded" &&
        disposition.carrierAnchorHashes.length === 0);
    if (!validOutcome) {
      throw new Error("Assembly decision ledger contains an invalid terminal outcome.");
    }
    if (
      disposition.factKind === "entity" &&
      ((disposition.outcome === "carried" &&
        disposition.carrierAnchorHashes.length === 0) ||
        (disposition.outcome !== "carried" &&
          disposition.carrierAnchorHashes.length > 0))
    ) {
      throw new Error("Assembly decision ledger contains an invalid entity carrier state.");
    }
  }

  for (const fact of sourceFactSet.facts) {
    if ((dispositionsByFactId.get(fact.factId) ?? []).length !== 1) {
      throw new Error("Every source fact must have exactly one terminal disposition.");
    }
  }
  if (dispositionsByFactId.size !== sourceFactSet.facts.length) {
    throw new Error("Assembly decision ledger contains a disposition for an unknown fact.");
  }
}

export function finalizeAssemblyDecisionCarrierSetV1({
  decisionSet,
  ledgerBuildMilliseconds,
  sourceFactSet,
}: {
  decisionSet: AssemblyDecisionCarrierSetV1;
  ledgerBuildMilliseconds: number;
  sourceFactSet: SourceFactSetV1;
}): AssemblyDecisionCarrierBuildResultV1 {
  assertAssemblyDecisionCarrierSetV1({ decisionSet, sourceFactSet });
  const serialized = stableJsonStringify(decisionSet);
  const serializedByteSize = Buffer.byteLength(serialized, "utf8");
  if (serializedByteSize >= ASSEMBLY_DECISION_LEDGER_MAX_BYTES) {
    throw new Error("Assembly decision ledger exceeded the 1 MB shadow gate.");
  }
  return {
    decisionSet,
    metrics: {
      decisionCount: decisionSet.decisions.length,
      decisionSetHash: hashStableValue(decisionSet),
      factDispositionCount: decisionSet.factDispositions.length,
      ledgerBuildMilliseconds: Math.max(0, ledgerBuildMilliseconds),
      resolverEvaluationCount: decisionSet.resolverRoleEvaluations.length,
      schemaVersion: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
      serializedByteSize,
      writerVersion: ASSEMBLY_DECISION_WRITER_VERSION,
    },
  };
}

export function allowedDispositionOutcomesForFactKindV1(
  kind: SourceFactKindV1
) {
  if (kind === "entity") return [...ENTITY_OUTCOMES].sort();
  if (kind === "relationship") return [...RELATIONSHIP_OUTCOMES].sort();
  if (kind === "intent") return [...INTENT_OUTCOMES].sort();
  if (kind === "decision") return [...DECISION_OUTCOMES].sort();
  return ["excluded"];
}
