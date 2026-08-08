import {
  ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
  ASSEMBLY_DECISION_LEDGER_MAX_BYTES,
  ASSEMBLY_DECISION_WRITER_VERSION,
  type AssemblyDecisionCarrierBuildResultV1,
  type AssemblyDecisionCarrierSetV1,
  type AssemblyDecisionDomainV1,
  type AssemblyDecisionProducerV1,
  type FactTerminalDispositionV1,
  type ResolverRoleEvaluationV1,
  type ResolverRoleRejectionCodeV1,
  type ResolverSourceLaneV1,
} from "@/lib/extraction/assembly-decision-carrier-ledger";
import {
  hashStableValue,
  stableJsonStringify,
} from "@/lib/extraction/source-document-index";
import type { SourceFactSetPersistenceResultV1 } from "@/lib/extraction/source-fact-ledger-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PROPOSED_ROLES = ["city_note", "keep_activity"] as const;
const CONFIDENCES = ["high", "medium", "low"] as const;
const RECONCILIATION_OUTCOMES = ["applied", "supporting", "rejected"] as const;
const REJECTION_CODES = [
  "low_confidence",
  "conflicting_classification",
  "unknown_candidate",
  "duplicate_proposal",
] as const satisfies readonly ResolverRoleRejectionCodeV1[];
const SOURCE_LANES = ["spine", "chunk", "recovery"] as const satisfies readonly ResolverSourceLaneV1[];
const DECISION_DOMAINS = [
  "classification",
  "containment",
  "identity",
  "grouping",
  "review",
  "publish_projection",
] as const satisfies readonly AssemblyDecisionDomainV1[];
const DECISION_PRODUCERS = [
  "resolver",
  "deterministic_assembly",
] as const satisfies readonly AssemblyDecisionProducerV1[];
const FACT_KINDS = [
  "entity",
  "relationship",
  "intent",
  "decision",
  "exclusion",
] as const;
const DISPOSITION_OUTCOMES = [
  "carried",
  "evidence_only",
  "unresolved",
  "applied",
  "rejected",
  "superseded",
  "review",
  "resolved_silently",
  "dismissed",
  "excluded",
] as const;

type CompactResolverEvaluationV1 = [
  evaluationId: string,
  proposedRole: number,
  confidence: number,
  reconciliationOutcome: number,
  rejectionMask: number,
  reasonDigest: string,
  subjectFactIndexes: number[],
  unresolvedSourceSpanIndexes: number[],
  sourceLane: number,
];

type CompactDecisionV1 = [
  decisionIdIndex: number,
  domain: number,
  producer: number,
  subjectFactIndexes: number[],
  unresolvedSourceSpanIndexes: number[],
  inputDecisionIndexes: number[],
  outcomeCodeIndex: number,
  applied: 0 | 1,
  writerVersion: number,
];

type CompactFactDispositionV1 = [
  factIdIndex: number,
  factKind: number,
  carrierAnchorIndexes: number[],
  decisionIdIndexes: number[],
  reasonCodeIndex: number,
  outcome: number,
];

/**
 * Persisted V1 form. Short top-level keys are intentional: the full in-memory
 * ledger is checkable and ergonomic, while this append-only representation
 * avoids repeating field names and stable ids hundreds of times per trip.
 * `expandAssemblyDecisionCarrierSetV1` proves that no semantics were dropped.
 */
export type CompactAssemblyDecisionCarrierSetV1 = {
  v: 1;
  sf: string;
  q: {
    c: string[];
    d: string[];
    f: string[];
    o: string[];
    r: string[];
    s: string[];
  };
  e: CompactResolverEvaluationV1[];
  d: CompactDecisionV1[];
  f: CompactFactDispositionV1[];
};

export type AssemblyDecisionLedgerTelemetryV1 = {
  additionalGeocodingLookupCount: 0;
  additionalModelCallCount: 0;
  additionalRetryCount: 0;
  ambiguousCount: number;
  buildMilliseconds: number;
  byteSize: number;
  countsByDecisionDomain: Record<string, number>;
  countsByDisposition: Record<string, number>;
  countsByProducer: Record<string, number>;
  countsByReconciliationOutcome: Record<string, number>;
  countsByRejectionCode: Record<string, number>;
  countsBySourceLane: Record<string, number>;
  decisionSetHash: string;
  outputFingerprintAfter: string | null;
  outputFingerprintBefore: string | null;
  schemaVersion: number;
  sourceFactLedgerHash: string;
  unresolvedCount: number;
  writerVersion: number;
};

export type AssemblyDecisionSetPersistenceResultV1 =
  | { status: "inserted"; decisionSetHash: string }
  | { status: "confirmed_existing"; decisionSetHash: string };

export class AssemblyDecisionLedgerPersistenceError extends Error {
  constructor(
    public readonly failureClass:
      | "decision_set_compaction_failed"
      | "decision_set_hash_collision"
      | "decision_set_insert_failed"
      | "decision_set_load_failed"
      | "decision_set_too_large"
      | "source_fact_dependency_unavailable",
    message: string
  ) {
    super(message);
    this.name = "AssemblyDecisionLedgerPersistenceError";
  }
}

type StoreError = { code?: string; message?: string } | null;
type StoreResult<T> = Promise<{ data: T | null; error: StoreError }>;
export type AssemblyDecisionSetStoreClient = {
  from(table: "trip_assembly_decision_sets"): {
    insert(value: Record<string, unknown>): StoreResult<unknown>;
    select(columns: "decision_set_hash"): {
      eq(column: "processing_run_id", value: string): {
        eq(column: "schema_version", value: number): {
          maybeSingle(): StoreResult<{ decision_set_hash?: unknown }>;
        };
      };
    };
  };
};

export function isAssemblyDecisionLedgerShadowEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.ASSEMBLY_DECISION_LEDGER_SHADOW === "1";
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function dictionaryIndex(values: readonly string[]) {
  const dictionary = sortedUnique(values);
  return {
    dictionary,
    index: new Map(dictionary.map((value, index) => [value, index])),
  };
}

function requiredIndex(index: ReadonlyMap<string, number>, value: string) {
  const found = index.get(value);
  if (found === undefined) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact dictionary lost a required value."
    );
  }
  return found;
}

function enumIndex<T extends string>(values: readonly T[], value: T) {
  const found = values.indexOf(value);
  if (found < 0) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact encoding received an unknown enum value."
    );
  }
  return found;
}

function enumValue<T extends string>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact encoding contains an invalid enum index."
    );
  }
  return value;
}

function dictionaryValue(values: readonly string[], index: number) {
  const value = values[index];
  if (value === undefined) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact encoding contains an invalid dictionary index."
    );
  }
  return value;
}

function rejectionMask(codes: readonly ResolverRoleRejectionCodeV1[]) {
  return codes.reduce(
    (mask, code) => mask | (1 << enumIndex(REJECTION_CODES, code)),
    0
  );
}

function rejectionCodes(mask: number) {
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= 1 << REJECTION_CODES.length) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact encoding contains an invalid rejection mask."
    );
  }
  return REJECTION_CODES.filter((_, index) => (mask & (1 << index)) !== 0);
}

function assertCompactPrivacyShape(decisionSet: AssemblyDecisionCarrierSetV1) {
  const all = (values: readonly string[], pattern: RegExp) =>
    values.every((value) => pattern.test(value));
  const factIds = [
    ...decisionSet.resolverRoleEvaluations.flatMap(
      (evaluation) => evaluation.subjectFactIds
    ),
    ...decisionSet.decisions.flatMap((decision) => decision.subjectFactIds),
    ...decisionSet.factDispositions.map((disposition) => disposition.factId),
  ];
  const spanIds = [
    ...decisionSet.resolverRoleEvaluations.flatMap(
      (evaluation) => evaluation.unresolvedSourceSpanIds
    ),
    ...decisionSet.decisions.flatMap(
      (decision) => decision.unresolvedSourceSpanIds
    ),
  ];
  if (
    !/^[a-f0-9]{64}$/.test(decisionSet.sourceFingerprint) ||
    !/^[a-f0-9]{64}$/.test(decisionSet.sourceFactLedgerHash) ||
    !all(factIds, /^fact_[a-f0-9]{24}$/) ||
    !all(spanIds, /^span_[a-f0-9]{32}$/) ||
    !all(
      decisionSet.resolverRoleEvaluations.map(
        (evaluation) => evaluation.evaluationId
      ),
      /^evaluation_[a-f0-9]{24}$/
    ) ||
    !all(
      decisionSet.resolverRoleEvaluations.map(
        (evaluation) => evaluation.reasonDigest
      ),
      /^[a-f0-9]{40}$/
    ) ||
    !all(
      decisionSet.decisions.map((decision) => decision.decisionId),
      /^decision_[a-f0-9]{24}$/
    ) ||
    !all(
      decisionSet.factDispositions.flatMap(
        (disposition) => disposition.carrierAnchorHashes
      ),
      /^carrier_[a-f0-9]{32}$/
    ) ||
    !all(
      decisionSet.decisions.map((decision) => decision.outcomeCode),
      /^[a-z0-9_]{1,160}$/
    ) ||
    !all(
      decisionSet.factDispositions.map(
        (disposition) => disposition.reasonCode
      ),
      /^[a-z0-9_]{1,160}$/
    )
  ) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision persistence received a non-allowlisted durable value."
    );
  }
}

export function compactAssemblyDecisionCarrierSetV1(
  decisionSet: AssemblyDecisionCarrierSetV1
): CompactAssemblyDecisionCarrierSetV1 {
  assertCompactPrivacyShape(decisionSet);
  const facts = dictionaryIndex([
    ...decisionSet.resolverRoleEvaluations.flatMap((value) => value.subjectFactIds),
    ...decisionSet.decisions.flatMap((value) => value.subjectFactIds),
    ...decisionSet.factDispositions.map((value) => value.factId),
  ]);
  const spans = dictionaryIndex([
    ...decisionSet.resolverRoleEvaluations.flatMap(
      (value) => value.unresolvedSourceSpanIds
    ),
    ...decisionSet.decisions.flatMap((value) => value.unresolvedSourceSpanIds),
  ]);
  const decisionIds = dictionaryIndex(
    decisionSet.decisions.map((value) => value.decisionId)
  );
  const carriers = dictionaryIndex(
    decisionSet.factDispositions.flatMap((value) => value.carrierAnchorHashes)
  );
  const outcomeCodes = dictionaryIndex(
    decisionSet.decisions.map((value) => value.outcomeCode)
  );
  const reasonCodes = dictionaryIndex(
    decisionSet.factDispositions.map((value) => value.reasonCode)
  );

  return {
    d: decisionSet.decisions.map((decision) => [
      requiredIndex(decisionIds.index, decision.decisionId),
      enumIndex(DECISION_DOMAINS, decision.domain),
      enumIndex(DECISION_PRODUCERS, decision.producer),
      decision.subjectFactIds.map((value) => requiredIndex(facts.index, value)),
      decision.unresolvedSourceSpanIds.map((value) =>
        requiredIndex(spans.index, value)
      ),
      decision.inputDecisionIds.map((value) =>
        requiredIndex(decisionIds.index, value)
      ),
      requiredIndex(outcomeCodes.index, decision.outcomeCode),
      decision.applied ? 1 : 0,
      decision.writerVersion,
    ]),
    e: decisionSet.resolverRoleEvaluations.map((evaluation) => [
      evaluation.evaluationId,
      enumIndex(PROPOSED_ROLES, evaluation.proposedRole),
      enumIndex(CONFIDENCES, evaluation.confidence),
      enumIndex(RECONCILIATION_OUTCOMES, evaluation.reconciliationOutcome),
      rejectionMask(evaluation.rejectionCodes),
      evaluation.reasonDigest,
      evaluation.subjectFactIds.map((value) => requiredIndex(facts.index, value)),
      evaluation.unresolvedSourceSpanIds.map((value) =>
        requiredIndex(spans.index, value)
      ),
      enumIndex(SOURCE_LANES, evaluation.sourceLane),
    ]),
    f: decisionSet.factDispositions.map((disposition) => [
      requiredIndex(facts.index, disposition.factId),
      enumIndex(FACT_KINDS, disposition.factKind),
      disposition.carrierAnchorHashes.map((value) =>
        requiredIndex(carriers.index, value)
      ),
      disposition.decisionIds.map((value) =>
        requiredIndex(decisionIds.index, value)
      ),
      requiredIndex(reasonCodes.index, disposition.reasonCode),
      enumIndex(DISPOSITION_OUTCOMES, disposition.outcome),
    ]),
    q: {
      c: carriers.dictionary,
      d: decisionIds.dictionary,
      f: facts.dictionary,
      o: outcomeCodes.dictionary,
      r: reasonCodes.dictionary,
      s: spans.dictionary,
    },
    sf: decisionSet.sourceFingerprint,
    v: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
  };
}

export function expandAssemblyDecisionCarrierSetV1({
  compact,
  sourceFactLedgerHash,
  sourceFactLedgerSchemaVersion,
}: {
  compact: CompactAssemblyDecisionCarrierSetV1;
  sourceFactLedgerHash: string;
  sourceFactLedgerSchemaVersion: 1;
}): AssemblyDecisionCarrierSetV1 {
  if (compact.v !== ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact encoding has an unknown schema version."
    );
  }
  const resolverRoleEvaluations: ResolverRoleEvaluationV1[] = compact.e.map(
    (evaluation) => ({
      confidence: enumValue(CONFIDENCES, evaluation[2]),
      evaluationId: evaluation[0],
      proposedRole: enumValue(PROPOSED_ROLES, evaluation[1]),
      reasonDigest: evaluation[5],
      reconciliationOutcome: enumValue(
        RECONCILIATION_OUTCOMES,
        evaluation[3]
      ),
      rejectionCodes: [...rejectionCodes(evaluation[4])],
      sourceLane: enumValue(SOURCE_LANES, evaluation[8]),
      subjectFactIds: evaluation[6].map((index) =>
        dictionaryValue(compact.q.f, index)
      ),
      unresolvedSourceSpanIds: evaluation[7].map((index) =>
        dictionaryValue(compact.q.s, index)
      ),
    })
  );
  const decisions = compact.d.map((decision) => ({
    applied: decision[7] === 1,
    decisionId: dictionaryValue(compact.q.d, decision[0]),
    domain: enumValue(DECISION_DOMAINS, decision[1]),
    inputDecisionIds: decision[5].map((index) =>
      dictionaryValue(compact.q.d, index)
    ),
    outcomeCode: dictionaryValue(compact.q.o, decision[6]),
    producer: enumValue(DECISION_PRODUCERS, decision[2]),
    subjectFactIds: decision[3].map((index) =>
      dictionaryValue(compact.q.f, index)
    ),
    unresolvedSourceSpanIds: decision[4].map((index) =>
      dictionaryValue(compact.q.s, index)
    ),
    writerVersion: decision[8] as typeof ASSEMBLY_DECISION_WRITER_VERSION,
  }));
  const factDispositions = compact.f.map((disposition) => ({
    carrierAnchorHashes: disposition[2].map((index) =>
      dictionaryValue(compact.q.c, index)
    ),
    decisionIds: disposition[3].map((index) =>
      dictionaryValue(compact.q.d, index)
    ),
    factId: dictionaryValue(compact.q.f, disposition[0]),
    factKind: enumValue(FACT_KINDS, disposition[1]),
    outcome: enumValue(DISPOSITION_OUTCOMES, disposition[5]),
    reasonCode: dictionaryValue(compact.q.r, disposition[4]),
  })) as FactTerminalDispositionV1[];
  return {
    decisions,
    factDispositions,
    resolverRoleEvaluations,
    schemaVersion: compact.v,
    sourceFactLedgerHash,
    sourceFactLedgerSchemaVersion,
    sourceFingerprint: compact.sf,
  };
}

function countBy(values: readonly string[], fixedValues: readonly string[] = []) {
  const counts = new Map(fixedValues.map((value) => [value, 0]));
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function compactAssemblyDecisionByteSizeV1(
  build: AssemblyDecisionCarrierBuildResultV1
) {
  return Buffer.byteLength(
    stableJsonStringify(compactAssemblyDecisionCarrierSetV1(build.decisionSet)),
    "utf8"
  );
}

export function createAssemblyDecisionLedgerTelemetryV1({
  build,
  outputFingerprintAfter = null,
  outputFingerprintBefore = null,
}: {
  build: AssemblyDecisionCarrierBuildResultV1;
  outputFingerprintAfter?: string | null;
  outputFingerprintBefore?: string | null;
}): AssemblyDecisionLedgerTelemetryV1 {
  const { decisionSet } = build;
  const unresolvedCount = decisionSet.factDispositions.filter(
    (disposition) => disposition.outcome === "unresolved"
  ).length;
  const ambiguousCount = decisionSet.resolverRoleEvaluations.filter(
    (evaluation) =>
      evaluation.subjectFactIds.length > 1 ||
      evaluation.unresolvedSourceSpanIds.length > 0
  ).length;
  return {
    additionalGeocodingLookupCount: 0,
    additionalModelCallCount: 0,
    additionalRetryCount: 0,
    ambiguousCount,
    buildMilliseconds: build.metrics.ledgerBuildMilliseconds,
    byteSize: compactAssemblyDecisionByteSizeV1(build),
    countsByDecisionDomain: countBy(
      decisionSet.decisions.map((decision) => decision.domain),
      DECISION_DOMAINS
    ),
    countsByDisposition: countBy(
      decisionSet.factDispositions.map(
        (disposition) => `${disposition.factKind}:${disposition.outcome}`
      )
    ),
    countsByProducer: countBy(
      decisionSet.decisions.map((decision) => decision.producer),
      DECISION_PRODUCERS
    ),
    countsByReconciliationOutcome: countBy(
      decisionSet.resolverRoleEvaluations.map(
        (evaluation) => evaluation.reconciliationOutcome
      ),
      RECONCILIATION_OUTCOMES
    ),
    countsByRejectionCode: countBy(
      decisionSet.resolverRoleEvaluations.flatMap(
        (evaluation) => evaluation.rejectionCodes
      ),
      REJECTION_CODES
    ),
    countsBySourceLane: countBy(
      decisionSet.resolverRoleEvaluations.map(
        (evaluation) => evaluation.sourceLane
      ),
      SOURCE_LANES
    ),
    decisionSetHash: build.metrics.decisionSetHash,
    outputFingerprintAfter,
    outputFingerprintBefore,
    schemaVersion: build.metrics.schemaVersion,
    sourceFactLedgerHash: decisionSet.sourceFactLedgerHash,
    unresolvedCount,
    writerVersion: build.metrics.writerVersion,
  };
}

function checkedCompactPayload(build: AssemblyDecisionCarrierBuildResultV1) {
  const compact = compactAssemblyDecisionCarrierSetV1(build.decisionSet);
  const expanded = expandAssemblyDecisionCarrierSetV1({
    compact,
    sourceFactLedgerHash: build.decisionSet.sourceFactLedgerHash,
    sourceFactLedgerSchemaVersion:
      build.decisionSet.sourceFactLedgerSchemaVersion,
  });
  if (hashStableValue(expanded) !== build.metrics.decisionSetHash) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_compaction_failed",
      "Assembly decision compact round trip changed ledger semantics."
    );
  }
  const byteSize = Buffer.byteLength(stableJsonStringify(compact), "utf8");
  if (byteSize >= ASSEMBLY_DECISION_LEDGER_MAX_BYTES) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_too_large",
      "Assembly decision set exceeded the 1 MB shadow persistence gate."
    );
  }
  return { byteSize, compact };
}

async function existingDecisionSetHash({
  client,
  processingRunId,
  schemaVersion,
}: {
  client: AssemblyDecisionSetStoreClient;
  processingRunId: string;
  schemaVersion: number;
}) {
  const { data, error } = await client
    .from("trip_assembly_decision_sets")
    .select("decision_set_hash")
    .eq("processing_run_id", processingRunId)
    .eq("schema_version", schemaVersion)
    .maybeSingle();
  if (error) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_load_failed",
      "Unable to inspect the existing assembly decision set."
    );
  }
  return typeof data?.decision_set_hash === "string"
    ? data.decision_set_hash
    : null;
}

function confirmExistingHash(existingHash: string, expectedHash: string) {
  if (existingHash !== expectedHash) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "decision_set_hash_collision",
      "An append-only assembly decision set already exists with a different hash."
    );
  }
  return {
    decisionSetHash: expectedHash,
    status: "confirmed_existing" as const,
  };
}

export async function persistAssemblyDecisionCarrierSetV1({
  build,
  client: suppliedClient,
  outputFingerprintAfter = null,
  outputFingerprintBefore = null,
  processingRunId,
  sourceFactPersistence,
  tripId,
}: {
  build: AssemblyDecisionCarrierBuildResultV1;
  client?: AssemblyDecisionSetStoreClient;
  outputFingerprintAfter?: string | null;
  outputFingerprintBefore?: string | null;
  processingRunId: string;
  sourceFactPersistence: SourceFactSetPersistenceResultV1 | null;
  tripId: string;
}): Promise<AssemblyDecisionSetPersistenceResultV1> {
  if (
    !sourceFactPersistence ||
    sourceFactPersistence.ledgerHash !== build.decisionSet.sourceFactLedgerHash
  ) {
    throw new AssemblyDecisionLedgerPersistenceError(
      "source_fact_dependency_unavailable",
      "Assembly decision persistence requires an exact persisted source fact set."
    );
  }
  const { compact } = checkedCompactPayload(build);
  const telemetry = createAssemblyDecisionLedgerTelemetryV1({
    build,
    outputFingerprintAfter,
    outputFingerprintBefore,
  });
  const client =
    suppliedClient ??
    ((await createSupabaseServerClient()) as unknown as AssemblyDecisionSetStoreClient);
  const existingHash = await existingDecisionSetHash({
    client,
    processingRunId,
    schemaVersion: build.metrics.schemaVersion,
  });
  if (existingHash) {
    return confirmExistingHash(existingHash, build.metrics.decisionSetHash);
  }

  const { error } = await client.from("trip_assembly_decision_sets").insert({
    decision_set_hash: build.metrics.decisionSetHash,
    decisions_json: compact,
    metrics_json: telemetry,
    processing_run_id: processingRunId,
    schema_version: build.metrics.schemaVersion,
    source_fact_ledger_hash: build.decisionSet.sourceFactLedgerHash,
    source_fact_ledger_schema_version:
      build.decisionSet.sourceFactLedgerSchemaVersion,
    trip_id: tripId,
  });
  if (!error) {
    return {
      decisionSetHash: build.metrics.decisionSetHash,
      status: "inserted",
    };
  }
  if (error.code === "23505") {
    const racedHash = await existingDecisionSetHash({
      client,
      processingRunId,
      schemaVersion: build.metrics.schemaVersion,
    });
    if (racedHash) {
      return confirmExistingHash(racedHash, build.metrics.decisionSetHash);
    }
  }
  throw new AssemblyDecisionLedgerPersistenceError(
    "decision_set_insert_failed",
    "Unable to append the assembly decision set."
  );
}
