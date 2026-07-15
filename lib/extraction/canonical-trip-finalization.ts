import { type DraftObject } from "@/lib/extraction/draft-value";
import { EVIDENCE_CLUSTER_VERSION } from "@/lib/extraction/evidence-clustering";
import {
  CANONICAL_IDENTITY_VERSION,
  createCanonicalIdentityManifest,
  type CanonicalIdentityManifest,
} from "@/lib/extraction/canonical-identity";

const CANONICAL_FINALIZATION_VERSION = 3;
const CANONICAL_FINALIZATION_KEY = "_canonicalFinalization";

export type CanonicalFinalizationDebug = {
  canonicalEntityCount: number;
  canonicalEvidenceVersion: number;
  canonicalIdentityVersion: number;
  canonicalReviewCount: number;
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

export class FinalizedCanonicalMutationError extends Error {
  constructor() {
    super("Finalized canonical identity cannot be changed during compilation.");
    this.name = "FinalizedCanonicalMutationError";
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
  const identity = asRecord(finalization.identity);

  return finalization.version === CANONICAL_FINALIZATION_VERSION &&
    identity.version === CANONICAL_IDENTITY_VERSION &&
    canonicalEvidenceVersion(record) === EVIDENCE_CLUSTER_VERSION
    ? finalization
    : null;
}

function sameIdentityManifest(
  finalization: DraftObject,
  identity: CanonicalIdentityManifest
) {
  return JSON.stringify(finalization.identity) === JSON.stringify(identity);
}

export function finalizeCanonicalTripDraft(draft: unknown): {
  debug: CanonicalFinalizationDebug;
  draft: unknown;
} {
  const record = asRecord(draft);
  const evidenceVersion = canonicalEvidenceVersion(record);
  const finalization = existingFinalization(record);

  if (evidenceVersion !== EVIDENCE_CLUSTER_VERSION) {
    throw new NonCanonicalDraftError(evidenceVersion);
  }

  const identity = createCanonicalIdentityManifest(record);

  if (finalization && sameIdentityManifest(finalization, identity)) {
    return {
      debug: {
        canonicalEntityCount: identity.entities.length,
        canonicalEvidenceVersion: evidenceVersion,
        canonicalIdentityVersion: identity.version,
        canonicalReviewCount: identity.reviews.length,
        status: "already_finalized",
      },
      draft,
    };
  }

  if (finalization) {
    throw new FinalizedCanonicalMutationError();
  }

  const debug: CanonicalFinalizationDebug = {
    canonicalEntityCount: identity.entities.length,
    canonicalEvidenceVersion: evidenceVersion,
    canonicalIdentityVersion: identity.version,
    canonicalReviewCount: identity.reviews.length,
    status: "finalized",
  };

  return {
    debug,
    draft: {
      ...record,
      [CANONICAL_FINALIZATION_KEY]: {
        ...debug,
        identity,
        version: CANONICAL_FINALIZATION_VERSION,
      },
    },
  };
}
