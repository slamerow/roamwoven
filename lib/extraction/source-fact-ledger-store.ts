import type { SourceCoverageV4 } from "@/lib/extraction/source-coverage-v4";
import {
  stableJsonStringify,
} from "@/lib/extraction/source-document-index";
import type { SourceFactLedgerBuildResultV1 } from "@/lib/extraction/source-fact-ledger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SOURCE_FACT_LEDGER_MAX_BYTES = 1024 * 1024;

export type SourceFactLedgerTelemetryV1 = {
  schemaVersion: number;
  ledgerHash: string;
  sourceFingerprint: string;
  sourceClauseCount: number;
  factCounts: SourceFactLedgerBuildResultV1["metrics"]["factCounts"];
  coverageCounts: SourceCoverageV4["counts"];
  unresolvedRelationshipMemberCount: number;
  candidateToSpanAmbiguityCount: number;
  serializedByteSize: number;
  ledgerBuildMilliseconds: number;
  outputFingerprintBefore: string | null;
  outputFingerprintAfter: string | null;
};

export type SourceFactSetPersistenceResultV1 =
  | { status: "inserted"; ledgerHash: string }
  | { status: "confirmed_existing"; ledgerHash: string };

export class SourceFactLedgerPersistenceError extends Error {
  constructor(
    public readonly failureClass:
      | "fact_set_hash_collision"
      | "fact_set_insert_failed"
      | "fact_set_load_failed"
      | "ledger_too_large",
    message: string
  ) {
    super(message);
    this.name = "SourceFactLedgerPersistenceError";
  }
}

type StoreError = { code?: string; message?: string } | null;
type StoreResult<T> = Promise<{ data: T | null; error: StoreError }>;
export type SourceFactSetStoreClient = {
  from(table: "trip_extraction_fact_sets"): {
    insert(value: Record<string, unknown>): StoreResult<unknown>;
    select(columns: "ledger_hash"): {
      eq(column: "processing_run_id", value: string): {
        eq(column: "schema_version", value: number): {
          maybeSingle(): StoreResult<{ ledger_hash?: unknown }>;
        };
      };
    };
  };
};

export function isSourceFactLedgerShadowEnabled(
  env: { EXTRACTION_FACT_LEDGER_SHADOW?: string } = process.env as {
    EXTRACTION_FACT_LEDGER_SHADOW?: string;
  }
) {
  return env.EXTRACTION_FACT_LEDGER_SHADOW === "1";
}

export function createSourceFactLedgerTelemetryV1({
  coverage,
  ledger,
  outputFingerprintAfter = null,
  outputFingerprintBefore = null,
}: {
  coverage: SourceCoverageV4;
  ledger: SourceFactLedgerBuildResultV1;
  outputFingerprintAfter?: string | null;
  outputFingerprintBefore?: string | null;
}): SourceFactLedgerTelemetryV1 {
  return {
    candidateToSpanAmbiguityCount:
      ledger.metrics.candidateToSpanAmbiguityCount,
    coverageCounts: coverage.counts,
    factCounts: ledger.metrics.factCounts,
    ledgerBuildMilliseconds: ledger.metrics.ledgerBuildMilliseconds,
    ledgerHash: ledger.metrics.ledgerHash,
    outputFingerprintAfter,
    outputFingerprintBefore,
    schemaVersion: ledger.metrics.schemaVersion,
    serializedByteSize: ledger.metrics.serializedByteSize,
    sourceClauseCount: ledger.metrics.sourceClauseCount,
    sourceFingerprint: ledger.factSet.sourceFingerprint,
    unresolvedRelationshipMemberCount:
      ledger.metrics.unresolvedRelationshipMemberCount,
  };
}

function checkedSerializedByteSize(ledger: SourceFactLedgerBuildResultV1) {
  const serializedByteSize = Buffer.byteLength(
    stableJsonStringify(ledger.factSet),
    "utf8"
  );
  if (serializedByteSize !== ledger.metrics.serializedByteSize) {
    throw new SourceFactLedgerPersistenceError(
      "fact_set_insert_failed",
      "Source fact ledger byte accounting changed before persistence."
    );
  }
  if (serializedByteSize >= SOURCE_FACT_LEDGER_MAX_BYTES) {
    throw new SourceFactLedgerPersistenceError(
      "ledger_too_large",
      "Source fact ledger exceeded the 1 MB shadow persistence gate."
    );
  }
  return serializedByteSize;
}

async function existingLedgerHash({
  client,
  processingRunId,
  schemaVersion,
}: {
  client: SourceFactSetStoreClient;
  processingRunId: string;
  schemaVersion: number;
}) {
  const { data, error } = await client
    .from("trip_extraction_fact_sets")
    .select("ledger_hash")
    .eq("processing_run_id", processingRunId)
    .eq("schema_version", schemaVersion)
    .maybeSingle();
  if (error) {
    throw new SourceFactLedgerPersistenceError(
      "fact_set_load_failed",
      "Unable to inspect the existing source fact set."
    );
  }
  return typeof data?.ledger_hash === "string" ? data.ledger_hash : null;
}

function confirmExistingHash(existingHash: string, expectedHash: string) {
  if (existingHash !== expectedHash) {
    throw new SourceFactLedgerPersistenceError(
      "fact_set_hash_collision",
      "An append-only source fact set already exists with a different hash."
    );
  }
  return {
    ledgerHash: expectedHash,
    status: "confirmed_existing" as const,
  };
}

export async function persistSourceFactSetV1({
  client: suppliedClient,
  coverage,
  ledger,
  outputFingerprintAfter = null,
  outputFingerprintBefore = null,
  processingRunId,
  tripId,
}: {
  client?: SourceFactSetStoreClient;
  coverage: SourceCoverageV4;
  ledger: SourceFactLedgerBuildResultV1;
  outputFingerprintAfter?: string | null;
  outputFingerprintBefore?: string | null;
  processingRunId: string;
  tripId: string;
}): Promise<SourceFactSetPersistenceResultV1> {
  checkedSerializedByteSize(ledger);
  const client =
    suppliedClient ??
    ((await createSupabaseServerClient()) as unknown as SourceFactSetStoreClient);
  const schemaVersion = ledger.metrics.schemaVersion;
  const existingHash = await existingLedgerHash({
    client,
    processingRunId,
    schemaVersion,
  });
  if (existingHash) {
    return confirmExistingHash(existingHash, ledger.metrics.ledgerHash);
  }

  const telemetry = createSourceFactLedgerTelemetryV1({
    coverage,
    ledger,
    outputFingerprintAfter,
    outputFingerprintBefore,
  });
  const { error } = await client.from("trip_extraction_fact_sets").insert({
    facts_json: ledger.factSet,
    ledger_hash: ledger.metrics.ledgerHash,
    metrics_json: telemetry,
    processing_run_id: processingRunId,
    schema_version: schemaVersion,
    source_fingerprint: ledger.factSet.sourceFingerprint,
    trip_id: tripId,
  });
  if (!error) {
    return { ledgerHash: ledger.metrics.ledgerHash, status: "inserted" };
  }

  // A concurrent retry may win the unique constraint. Confirm its immutable
  // hash; never turn the race into an overwrite/upsert.
  if (error.code === "23505") {
    const racedHash = await existingLedgerHash({
      client,
      processingRunId,
      schemaVersion,
    });
    if (racedHash) return confirmExistingHash(racedHash, ledger.metrics.ledgerHash);
  }
  throw new SourceFactLedgerPersistenceError(
    "fact_set_insert_failed",
    "Unable to append the source fact set."
  );
}
