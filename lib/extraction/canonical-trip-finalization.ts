import { type DraftObject } from "@/lib/extraction/draft-value";
import { EVIDENCE_CLUSTER_VERSION } from "@/lib/extraction/evidence-clustering";

const CANONICAL_FINALIZATION_VERSION = 1;
const CANONICAL_FINALIZATION_KEY = "_canonicalFinalization";

export type CanonicalFinalizationDebug = {
  canonicalEvidenceVersion: number;
  status: "already_finalized" | "finalized";
};

export class NonCanonicalDraftError extends Error {
  constructor(version: number | null) {
    super(
      version === null
        ? "Trip finalization requires canonical evidence."
        : `Trip finalization requires evidence version ${EVIDENCE_CLUSTER_VERSION}; received version ${version}.`
    );
    this.name = "NonCanonicalDraftError";
  }
}

function asRecord(value: unknown): DraftObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftObject)
    : {};
}

function canonicalEvidenceVersion(record: DraftObject) {
  const evidence = asRecord(record._evidence);
  return typeof evidence.version === "number" ? evidence.version : null;
}

function existingFinalization(record: DraftObject) {
  const finalization = asRecord(record[CANONICAL_FINALIZATION_KEY]);

  return finalization.version === CANONICAL_FINALIZATION_VERSION
    ? finalization
    : null;
}

export function finalizeCanonicalTripDraft(draft: unknown): {
  debug: CanonicalFinalizationDebug;
  draft: unknown;
} {
  const record = asRecord(draft);
  const evidenceVersion = canonicalEvidenceVersion(record);
  const finalization = existingFinalization(record);

  if (finalization) {
    return {
      debug: {
        canonicalEvidenceVersion: evidenceVersion ?? 0,
        status: "already_finalized",
      },
      draft,
    };
  }

  if (evidenceVersion !== EVIDENCE_CLUSTER_VERSION) {
    throw new NonCanonicalDraftError(evidenceVersion);
  }

  const debug: CanonicalFinalizationDebug = {
    canonicalEvidenceVersion: evidenceVersion,
    status: "finalized",
  };

  return {
    debug,
    draft: {
      ...record,
      [CANONICAL_FINALIZATION_KEY]: {
        ...debug,
        version: CANONICAL_FINALIZATION_VERSION,
      },
    },
  };
}

export function preparePersistedTripDraftForStructuredCompilation(draft: unknown) {
  const record = asRecord(draft);

  if (
    existingFinalization(record) ||
    canonicalEvidenceVersion(record) === EVIDENCE_CLUSTER_VERSION
  ) {
    return finalizeCanonicalTripDraft(draft).draft;
  }

  // Historical snapshots are immutable inputs. They remain viewable as stored,
  // but they never reactivate the deleted legacy assembly transformations.
  return draft;
}
