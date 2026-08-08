import assert from "node:assert/strict";

import { buildAssemblyDecisionCarrierLedgerV1 } from "@/lib/extraction/assembly-decision-carrier-builder";
import {
  ASSEMBLY_DECISION_TELEMETRY_ALLOWLIST_V1,
  type AssemblyDecisionCarrierBuildResultV1,
} from "@/lib/extraction/assembly-decision-carrier-ledger";
import {
  AssemblyDecisionLedgerPersistenceError,
  compactAssemblyDecisionByteSizeV1,
  compactAssemblyDecisionCarrierSetV1,
  createAssemblyDecisionLedgerTelemetryV1,
  expandAssemblyDecisionCarrierSetV1,
  isAssemblyDecisionLedgerShadowEnabled,
  persistAssemblyDecisionCarrierSetV1,
  type AssemblyDecisionSetStoreClient,
} from "@/lib/extraction/assembly-decision-carrier-ledger-store";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  buildSourceDocumentIndexV1,
  hashStableValue,
} from "@/lib/extraction/source-document-index";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
import {
  HETEROGENEOUS_ASSEMBLY_FIXTURES,
  evidenceStageForFixture,
} from "@/tests/fixtures/assembly-decision-heterogeneous";

function buildBookingLedger() {
  const fixture = HETEROGENEOUS_ASSEMBLY_FIXTURES.find(
    (candidate) => candidate.name === "booking_heavy"
  )!;
  const index = buildSourceDocumentIndexV1([
    {
      filename: fixture.filename,
      sourceProvenance: "sanitized_test",
      sourceUploadId: fixture.sourceUploadId,
      text: fixture.text,
      type: "text",
    },
  ]);
  const stage = evidenceStageForFixture(
    fixture,
    index.spans.map((span) => span.spanId)
  );
  const sourceLedger = buildSourceFactLedgerV1({ index, stages: [stage] });
  const clustered = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [stage],
    tripOverview: fixture.tripOverview,
  });
  const records = createStructuredTripRecordsFromDraft({
    draft: clustered.draft,
    fallbackTripName: "compact booking fixture",
    tripId: "compact-booking-fixture",
  });
  const build = buildAssemblyDecisionCarrierLedgerV1({
    index,
    observations: clustered.observations,
    pieces: clustered.pieces,
    records,
    sourceLedger,
    stages: [stage],
  });
  return { build, sourceLedger };
}

function createStoreClient({
  existingHash = null,
  insertError = null,
}: {
  existingHash?: string | null;
  insertError?: { code?: string; message?: string } | null;
} = {}) {
  const inserts: Record<string, unknown>[] = [];
  let loadedHash = existingHash;
  const client: AssemblyDecisionSetStoreClient = {
    from: () => ({
      insert: async (value) => {
        inserts.push(value);
        if (!insertError) loadedHash = value.decision_set_hash as string;
        return { data: null, error: insertError };
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: loadedHash
                ? { decision_set_hash: loadedHash }
                : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  return { client, inserts };
}

export default async function run() {
  assert.equal(isAssemblyDecisionLedgerShadowEnabled({}), false);
  assert.equal(
    isAssemblyDecisionLedgerShadowEnabled({
      ASSEMBLY_DECISION_LEDGER_SHADOW: "true",
    }),
    false
  );
  assert.equal(
    isAssemblyDecisionLedgerShadowEnabled({
      ASSEMBLY_DECISION_LEDGER_SHADOW: "1",
    }),
    true
  );

  const { build, sourceLedger } = buildBookingLedger();
  const compact = compactAssemblyDecisionCarrierSetV1(build.decisionSet);
  const expanded = expandAssemblyDecisionCarrierSetV1({
    compact,
    sourceFactLedgerHash: build.decisionSet.sourceFactLedgerHash,
    sourceFactLedgerSchemaVersion:
      build.decisionSet.sourceFactLedgerSchemaVersion,
  });
  assert.deepEqual(expanded, build.decisionSet);
  assert.deepEqual(
    compactAssemblyDecisionCarrierSetV1(expanded),
    compact,
    "compact persistence is deterministic and reversible"
  );
  assert.ok(compactAssemblyDecisionByteSizeV1(build) < 256 * 1024);
  assert.ok(
    compactAssemblyDecisionByteSizeV1(build) +
      sourceLedger.metrics.serializedByteSize <
      512 * 1024
  );

  const telemetry = createAssemblyDecisionLedgerTelemetryV1({
    build,
    outputFingerprintAfter: "same-output-hash",
    outputFingerprintBefore: "same-output-hash",
  });
  assert.deepEqual(
    Object.keys(telemetry).sort(),
    [...ASSEMBLY_DECISION_TELEMETRY_ALLOWLIST_V1].sort()
  );
  assert.equal(telemetry.additionalModelCallCount, 0);
  assert.equal(telemetry.additionalGeocodingLookupCount, 0);
  assert.equal(telemetry.additionalRetryCount, 0);
  for (const protectedValue of ["ZX91-QP77", "4412", "Door code"]) {
    assert.doesNotMatch(JSON.stringify(telemetry), new RegExp(protectedValue, "i"));
    assert.doesNotMatch(JSON.stringify(compact), new RegExp(protectedValue, "i"));
  }

  const dependency = {
    ledgerHash: build.decisionSet.sourceFactLedgerHash,
    status: "inserted" as const,
  };
  const insertedStore = createStoreClient();
  const inserted = await persistAssemblyDecisionCarrierSetV1({
    build,
    client: insertedStore.client,
    outputFingerprintAfter: "same-output-hash",
    outputFingerprintBefore: "same-output-hash",
    processingRunId: "run-decision-store",
    sourceFactPersistence: dependency,
    tripId: "trip-decision-store",
  });
  assert.deepEqual(inserted, {
    decisionSetHash: build.metrics.decisionSetHash,
    status: "inserted",
  });
  assert.equal(insertedStore.inserts.length, 1);
  assert.deepEqual(insertedStore.inserts[0].decisions_json, compact);
  assert.equal(
    insertedStore.inserts[0].source_fact_ledger_hash,
    dependency.ledgerHash
  );

  const confirmedStore = createStoreClient({
    existingHash: build.metrics.decisionSetHash,
  });
  assert.deepEqual(
    await persistAssemblyDecisionCarrierSetV1({
      build,
      client: confirmedStore.client,
      processingRunId: "run-decision-store",
      sourceFactPersistence: dependency,
      tripId: "trip-decision-store",
    }),
    {
      decisionSetHash: build.metrics.decisionSetHash,
      status: "confirmed_existing",
    }
  );
  assert.equal(confirmedStore.inserts.length, 0);

  await assert.rejects(
    persistAssemblyDecisionCarrierSetV1({
      build,
      client: createStoreClient().client,
      processingRunId: "run-decision-store",
      sourceFactPersistence: null,
      tripId: "trip-decision-store",
    }),
    (error) =>
      error instanceof AssemblyDecisionLedgerPersistenceError &&
      error.failureClass === "source_fact_dependency_unavailable"
  );
  await assert.rejects(
    persistAssemblyDecisionCarrierSetV1({
      build,
      client: createStoreClient().client,
      processingRunId: "run-decision-store",
      sourceFactPersistence: {
        ledgerHash: "f".repeat(64),
        status: "confirmed_existing",
      },
      tripId: "trip-decision-store",
    }),
    (error) =>
      error instanceof AssemblyDecisionLedgerPersistenceError &&
      error.failureClass === "source_fact_dependency_unavailable"
  );
  await assert.rejects(
    persistAssemblyDecisionCarrierSetV1({
      build,
      client: createStoreClient({ existingHash: "e".repeat(64) }).client,
      processingRunId: "run-decision-store",
      sourceFactPersistence: dependency,
      tripId: "trip-decision-store",
    }),
    (error) =>
      error instanceof AssemblyDecisionLedgerPersistenceError &&
      error.failureClass === "decision_set_hash_collision"
  );

  const privacyInvalid = structuredClone(
    build
  ) as AssemblyDecisionCarrierBuildResultV1;
  privacyInvalid.decisionSet.factDispositions[0].reasonCode = "Door code 4412";
  privacyInvalid.metrics.decisionSetHash = hashStableValue(
    privacyInvalid.decisionSet
  );
  await assert.rejects(
    persistAssemblyDecisionCarrierSetV1({
      build: privacyInvalid,
      client: createStoreClient().client,
      processingRunId: "run-decision-store-private",
      sourceFactPersistence: dependency,
      tripId: "trip-decision-store",
    }),
    (error) =>
      error instanceof AssemblyDecisionLedgerPersistenceError &&
      error.failureClass === "decision_set_compaction_failed"
  );

  const oversized = structuredClone(build) as AssemblyDecisionCarrierBuildResultV1;
  const originalDecisions = oversized.decisionSet.decisions;
  const seedDecision = oversized.decisionSet.decisions[0];
  oversized.decisionSet.decisions = [
    ...originalDecisions,
    ...Array.from(
    { length: 40_000 },
    (_, index) => ({
      ...seedDecision,
      decisionId: `decision_${index.toString(16).padStart(24, "0")}`,
      inputDecisionIds: [],
    })
    ),
  ];
  oversized.metrics.decisionSetHash = hashStableValue(oversized.decisionSet);
  await assert.rejects(
    persistAssemblyDecisionCarrierSetV1({
      build: oversized,
      client: createStoreClient().client,
      processingRunId: "run-decision-store-oversized",
      sourceFactPersistence: dependency,
      tripId: "trip-decision-store",
    }),
    (error) =>
      error instanceof AssemblyDecisionLedgerPersistenceError &&
      error.failureClass === "decision_set_too_large"
  );
}
