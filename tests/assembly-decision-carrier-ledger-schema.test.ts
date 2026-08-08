import assert from "node:assert/strict";

import {
  ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
  ASSEMBLY_DECISION_DOMAINS_V1,
  ASSEMBLY_DECISION_TELEMETRY_ALLOWLIST_V1,
  ASSEMBLY_DECISION_WRITER_VERSION,
  LOOP9_AUDIT_BASELINES_V1,
  allowedDispositionOutcomesForFactKindV1,
  createAssemblyDecisionIdV1,
  createCarrierAnchorHashV1,
  createResolverRoleEvaluationIdV1,
  digestResolverReasonV1,
  finalizeAssemblyDecisionCarrierSetV1,
  resolverRoleEvaluationBindingStatusV1,
  type AssemblyDecisionCarrierSetV1,
  type AssemblyDecisionV1,
  type FactTerminalDispositionV1,
} from "@/lib/extraction/assembly-decision-carrier-ledger";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
import { sourceFactFixture } from "@/tests/fixtures/source-fact-ledger-v1";

const IMMUTABLE_SOURCE_FACT_FIXTURE_HASH =
  "fb809ffa8d5d43194ca34098cbe8f380b84adeb445d94a16d6e6a34e735d930d";

function terminalFor(
  fact: ReturnType<typeof buildSourceFactLedgerV1>["factSet"]["facts"][number],
  decisionId: string
): FactTerminalDispositionV1 {
  const base = {
    carrierAnchorHashes: [],
    decisionIds: [decisionId],
    factId: fact.factId,
    reasonCode: "schema_fixture_terminal",
  };
  if (fact.kind === "entity") {
    return { ...base, factKind: fact.kind, outcome: "evidence_only" };
  }
  if (fact.kind === "relationship") {
    return { ...base, factKind: fact.kind, outcome: "rejected" };
  }
  if (fact.kind === "intent") {
    return { ...base, factKind: fact.kind, outcome: "superseded" };
  }
  if (fact.kind === "decision") {
    return { ...base, factKind: fact.kind, outcome: "dismissed" };
  }
  return {
    ...base,
    carrierAnchorHashes: [],
    factKind: fact.kind,
    outcome: "excluded",
  };
}

export default function run() {
  const fixture = sourceFactFixture();
  const sourceLedger = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage],
  });

  assert.equal(
    sourceLedger.metrics.ledgerHash,
    IMMUTABLE_SOURCE_FACT_FIXTURE_HASH,
    "Loop 9 may not change Source Fact Ledger V1 bytes, ids, or hash behavior"
  );
  assert.deepEqual(Object.keys(sourceLedger.factSet).sort(), [
    "carrierEdges",
    "facts",
    "schemaVersion",
    "sourceFingerprint",
    "sourceSpans",
    "sources",
  ]);

  assert.deepEqual(ASSEMBLY_DECISION_DOMAINS_V1, [
    "classification",
    "containment",
    "identity",
    "grouping",
    "review",
    "publish_projection",
  ]);
  assert.deepEqual(LOOP9_AUDIT_BASELINES_V1, {
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
  });

  const firstFact = sourceLedger.factSet.facts[0];
  const decisionInput = {
    applied: true,
    domain: "publish_projection" as const,
    inputDecisionIds: ["decision_parent_b", "decision_parent_a"],
    outcomeCode: "schema_fixture_terminal",
    producer: "deterministic_assembly" as const,
    subjectFactIds: [firstFact.factId, firstFact.factId],
    unresolvedSourceSpanIds: [...firstFact.sourceSpanIds].reverse(),
  };
  assert.equal(
    createAssemblyDecisionIdV1(decisionInput),
    createAssemblyDecisionIdV1({
      ...decisionInput,
      inputDecisionIds: [...decisionInput.inputDecisionIds].reverse(),
      subjectFactIds: [...decisionInput.subjectFactIds].reverse(),
      unresolvedSourceSpanIds: [...decisionInput.unresolvedSourceSpanIds].reverse(),
    }),
    "decision identity cannot depend on input array order"
  );

  const reasonDigest = digestResolverReasonV1(
    "Sanitized model reason that must never be persisted verbatim."
  );
  const evaluationInput = {
    confidence: "high" as const,
    duplicateOrdinal: 0,
    proposedRole: "city_note" as const,
    reasonDigest,
    reconciliationOutcome: "applied" as const,
    rejectionCodes: [],
    sourceLane: "chunk" as const,
    stableWindowDigest: "window_fixture_digest",
    subjectFactIds: [firstFact.factId],
    unresolvedSourceSpanIds: [],
  };
  const evaluationId = createResolverRoleEvaluationIdV1(evaluationInput);
  assert.equal(evaluationId, createResolverRoleEvaluationIdV1(evaluationInput));
  assert.notEqual(
    evaluationId,
    createResolverRoleEvaluationIdV1({
      ...evaluationInput,
      indistinguishableOccurrenceOrdinal: 1,
    }),
    "indistinguishable raw proposals retain deterministic multiplicity"
  );
  assert.equal(
    resolverRoleEvaluationBindingStatusV1({
      subjectFactIds: [firstFact.factId],
      unresolvedSourceSpanIds: [],
    }),
    "source_fact"
  );
  assert.equal(
    resolverRoleEvaluationBindingStatusV1({
      subjectFactIds: [],
      unresolvedSourceSpanIds: [fixture.index.spans[0].spanId],
    }),
    "source_span"
  );
  assert.equal(
    resolverRoleEvaluationBindingStatusV1({
      subjectFactIds: [],
      unresolvedSourceSpanIds: [],
    }),
    "unresolved",
    "no invented reference is an explicit unresolved binding"
  );
  assert.throws(
    () =>
      resolverRoleEvaluationBindingStatusV1({
        subjectFactIds: [firstFact.factId],
        unresolvedSourceSpanIds: [fixture.index.spans[0].spanId],
      }),
    /mixes fact and unresolved-span bindings/
  );

  const decisions: AssemblyDecisionV1[] = sourceLedger.factSet.facts.map(
    (fact) => {
      const input = {
        applied: true,
        domain: "publish_projection" as const,
        inputDecisionIds: [],
        outcomeCode: "schema_fixture_terminal",
        producer: "deterministic_assembly" as const,
        subjectFactIds: [fact.factId],
        unresolvedSourceSpanIds: [],
      };
      return {
        ...input,
        decisionId: createAssemblyDecisionIdV1(input),
        writerVersion: ASSEMBLY_DECISION_WRITER_VERSION,
      };
    }
  );
  const decisionByFactId = new Map(
    decisions.map((decision) => [decision.subjectFactIds[0], decision.decisionId])
  );
  const decisionSet: AssemblyDecisionCarrierSetV1 = {
    decisions,
    factDispositions: sourceLedger.factSet.facts.map((fact) =>
      terminalFor(fact, decisionByFactId.get(fact.factId)!)
    ),
    resolverRoleEvaluations: [
      {
        confidence: evaluationInput.confidence,
        evaluationId,
        proposedRole: evaluationInput.proposedRole,
        reasonDigest,
        reconciliationOutcome: evaluationInput.reconciliationOutcome,
        rejectionCodes: [],
        sourceLane: "chunk",
        subjectFactIds: [firstFact.factId],
        unresolvedSourceSpanIds: [],
      },
    ],
    schemaVersion: ASSEMBLY_DECISION_CARRIER_LEDGER_SCHEMA_VERSION,
    sourceFactLedgerHash: sourceLedger.metrics.ledgerHash,
    sourceFactLedgerSchemaVersion: sourceLedger.factSet.schemaVersion,
    sourceFingerprint: sourceLedger.factSet.sourceFingerprint,
  };
  const finalized = finalizeAssemblyDecisionCarrierSetV1({
    decisionSet,
    ledgerBuildMilliseconds: 1,
    sourceFactSet: sourceLedger.factSet,
  });
  assert.equal(finalized.metrics.factDispositionCount, sourceLedger.factSet.facts.length);
  assert.equal(finalized.metrics.schemaVersion, 1);
  assert.ok(finalized.metrics.decisionSetHash.length > 40);

  const carrierAnchor = createCarrierAnchorHashV1({
    carrierClass: "activity",
    context: {
      date: "2034-04-07",
      legKey: "leg_hash_only",
      normalizedTitleDigest: "title_digest_only",
    },
    sourceFactIds: [firstFact.factId],
  });
  assert.match(carrierAnchor, /^carrier_[a-f0-9]{32}$/);

  assert.deepEqual(allowedDispositionOutcomesForFactKindV1("entity"), [
    "carried",
    "evidence_only",
    "unresolved",
  ]);
  assert.deepEqual(allowedDispositionOutcomesForFactKindV1("exclusion"), [
    "excluded",
  ]);

  const serialized = JSON.stringify(finalized.decisionSet);
  for (const forbidden of [
    "Prague Castle",
    "Vinárna Čertovka",
    "Sanitized model reason",
    "candidateId",
    "sourceExcerpt",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
  for (const forbiddenTelemetryKey of [
    "title",
    "excerpt",
    "address",
    "bookingValue",
    "candidateId",
    "reason",
  ]) {
    assert.ok(
      !ASSEMBLY_DECISION_TELEMETRY_ALLOWLIST_V1.includes(
        forbiddenTelemetryKey as never
      )
    );
  }

  assert.throws(
    () =>
      finalizeAssemblyDecisionCarrierSetV1({
        decisionSet: {
          ...decisionSet,
          factDispositions: decisionSet.factDispositions.slice(1),
        },
        ledgerBuildMilliseconds: 1,
        sourceFactSet: sourceLedger.factSet,
      }),
    /exactly one terminal disposition/
  );
}
