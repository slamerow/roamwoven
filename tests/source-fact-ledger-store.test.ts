import assert from "node:assert/strict";

import { buildSourceCoverageV4 } from "@/lib/extraction/source-coverage-v4";
import {
  hashStableValue,
  stableJsonStringify,
} from "@/lib/extraction/source-document-index";
import {
  SOURCE_FACT_LEDGER_MAX_BYTES,
  SourceFactLedgerPersistenceError,
  createSourceFactLedgerTelemetryV1,
  isSourceFactLedgerShadowEnabled,
  persistSourceFactSetV1,
  type SourceFactSetStoreClient,
} from "@/lib/extraction/source-fact-ledger-store";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
import { sourceFactFixture } from "@/tests/fixtures/source-fact-ledger-v1";

function mockStore() {
  let existingHash: string | null = null;
  let insertError: { code?: string; message?: string } | null = null;
  const inserts: Record<string, unknown>[] = [];
  const client: SourceFactSetStoreClient = {
    from() {
      return {
        async insert(value) {
          inserts.push(value);
          if (!insertError) existingHash = value.ledger_hash as string;
          return { data: null, error: insertError };
        },
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: existingHash
                          ? { ledger_hash: existingHash }
                          : null,
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return {
    client,
    inserts,
    setExistingHash(value: string | null) {
      existingHash = value;
    },
    setInsertError(value: typeof insertError) {
      insertError = value;
    },
  };
}

export default async function run() {
  assert.equal(isSourceFactLedgerShadowEnabled({}), false);
  assert.equal(
    isSourceFactLedgerShadowEnabled({ EXTRACTION_FACT_LEDGER_SHADOW: "true" }),
    false
  );
  assert.equal(
    isSourceFactLedgerShadowEnabled({ EXTRACTION_FACT_LEDGER_SHADOW: "1" }),
    true
  );

  const fixture = sourceFactFixture();
  const ledger = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage],
  });
  const coverage = buildSourceCoverageV4({
    factSet: ledger.factSet,
    index: fixture.index,
  });
  const telemetry = createSourceFactLedgerTelemetryV1({
    coverage,
    ledger,
    outputFingerprintAfter: "after-hash",
    outputFingerprintBefore: "before-hash",
  });
  assert.deepEqual(Object.keys(telemetry).sort(), [
    "candidateToSpanAmbiguityCount",
    "coverageCounts",
    "factCounts",
    "ledgerBuildMilliseconds",
    "ledgerHash",
    "outputFingerprintAfter",
    "outputFingerprintBefore",
    "schemaVersion",
    "serializedByteSize",
    "sourceClauseCount",
    "sourceFingerprint",
    "unresolvedRelationshipMemberCount",
  ]);
  const serializedTelemetry = JSON.stringify(telemetry);
  for (const privateValue of [
    "Prague Castle",
    "Vinárna Čertovka",
    "Budget: $900",
    "Write postcards",
  ]) {
    assert.doesNotMatch(serializedTelemetry, new RegExp(privateValue, "i"));
  }

  const store = mockStore();
  const inserted = await persistSourceFactSetV1({
    client: store.client,
    coverage,
    ledger,
    outputFingerprintAfter: "after-hash",
    outputFingerprintBefore: "before-hash",
    processingRunId: "run-one",
    tripId: "trip-one",
  });
  assert.equal(inserted.status, "inserted");
  assert.equal(store.inserts.length, 1, "one fact set produces one insert");
  assert.deepEqual(store.inserts[0].facts_json, ledger.factSet);
  assert.deepEqual(store.inserts[0].metrics_json, telemetry);

  const repeated = await persistSourceFactSetV1({
    client: store.client,
    coverage,
    ledger,
    processingRunId: "run-one",
    tripId: "trip-one",
  });
  assert.equal(repeated.status, "confirmed_existing");
  assert.equal(store.inserts.length, 1, "an idempotent repeat never writes again");

  store.setExistingHash("0".repeat(64));
  await assert.rejects(
    persistSourceFactSetV1({
      client: store.client,
      coverage,
      ledger,
      processingRunId: "run-one",
      tripId: "trip-one",
    }),
    (error: unknown) =>
      error instanceof SourceFactLedgerPersistenceError &&
      error.failureClass === "fact_set_hash_collision"
  );

  const oversizedFactSet = {
    ...ledger.factSet,
    facts: [
      ...ledger.factSet.facts,
      {
        factId: "fact_oversized_local_only",
        kind: "decision" as const,
        payload: { localGatePadding: "x".repeat(SOURCE_FACT_LEDGER_MAX_BYTES) },
        producer: "deterministic_source" as const,
        sourceSpanIds: [],
      },
    ],
  };
  const oversized = {
    factSet: oversizedFactSet,
    metrics: {
      ...ledger.metrics,
      ledgerHash: hashStableValue(oversizedFactSet),
      serializedByteSize: Buffer.byteLength(
        stableJsonStringify(oversizedFactSet),
        "utf8"
      ),
    },
  };
  await assert.rejects(
    persistSourceFactSetV1({
      client: store.client,
      coverage,
      ledger: oversized,
      processingRunId: "run-large",
      tripId: "trip-one",
    }),
    (error: unknown) =>
      error instanceof SourceFactLedgerPersistenceError &&
      error.failureClass === "ledger_too_large"
  );

  const failingStore = mockStore();
  failingStore.setInsertError({ code: "XX000", message: "private db detail" });
  await assert.rejects(
    persistSourceFactSetV1({
      client: failingStore.client,
      coverage,
      ledger,
      processingRunId: "run-fail",
      tripId: "trip-one",
    }),
    (error: unknown) =>
      error instanceof SourceFactLedgerPersistenceError &&
      error.failureClass === "fact_set_insert_failed" &&
      !error.message.includes("private db detail")
  );
}
