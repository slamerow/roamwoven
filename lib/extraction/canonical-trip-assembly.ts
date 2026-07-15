import { createHash } from "node:crypto";
import {
  FinalizedCanonicalMutationError,
  finalizeCanonicalTripDraft,
  NonCanonicalDraftError,
  type CanonicalFinalizationDebug,
} from "@/lib/extraction/canonical-trip-finalization";
import { CanonicalIdentityInvariantError } from "@/lib/extraction/canonical-identity";
import {
  canonicalizeCanonicalReviewDetails,
  canonicalPiecePublicPayload,
  EVIDENCE_CLUSTER_VERSION,
  type CanonicalEvidencePiece,
  type EvidenceObservation,
  type EvidenceObservationDisposition,
} from "@/lib/extraction/evidence-clustering";
import {
  CanonicalProjectionInvariantError,
  createStructuredTripRecordsFromDraft,
} from "@/lib/extraction/draft-to-structured-trip";
import {
  getArray,
  getObject,
  getString,
} from "@/lib/extraction/draft-value";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

export type CanonicalAssemblyRecoverySummary = {
  actions: string[];
  attempted: boolean;
  initialViolations: string[];
  status: "not_needed" | "repaired";
};

export type PreparedCanonicalEvidencePieces = {
  pieces: CanonicalEvidencePiece[];
  recoveryActions: string[];
};

type CanonicalAssemblyRecoveryFailureDetails = {
  actions: string[];
  initialError: {
    message: string;
    name: string;
    violations: string[];
  };
  retryError: {
    message: string;
    name: string;
    violations: string[];
  };
  stage: "compilation" | "finalization" | "repair";
};

export class CanonicalAssemblyRecoveryError extends Error {
  constructor(public details: CanonicalAssemblyRecoveryFailureDetails) {
    super(
      "Roamwoven could not safely recover the canonical assembly during bounded deterministic recovery."
    );
    this.name = "CanonicalAssemblyRecoveryError";
  }
}

class UnsafeCanonicalRepairError extends Error {
  constructor(public violations: string[]) {
    super(`Canonical repair is unsafe: ${violations.join("; ")}`);
    this.name = "UnsafeCanonicalRepairError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)])
  );
}

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, semanticValue(child)])
  );
}

function semanticSignature(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(semanticValue(value)))
    .digest("hex");
}

function pieceSignature(piece: CanonicalEvidencePiece) {
  const { id: _canonicalId, ...artifact } = piece;

  return createHash("sha256")
    .update(JSON.stringify(stableValue(artifact)))
    .digest("hex");
}

const PIECE_COLLECTIONS = [
  { collection: "activities", kinds: ["activity", "note"] },
  { collection: "places", kinds: ["place"] },
  { collection: "stays", kinds: ["stay"] },
  { collection: "transport", kinds: ["transport"] },
] as const;

function sameOrderedValues(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function dispositionManifestViolations({
  evidence,
  pieces,
}: {
  evidence: Record<string, unknown>;
  pieces: CanonicalEvidencePiece[];
}) {
  const violations: string[] = [];
  const observationIds = getArray(evidence, "observationIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );
  const dispositions = getArray(evidence, "dispositions").map(asRecord);
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const dispositionIds = dispositions.map((item) =>
    getString(item, "observationId") ?? ""
  );

  if (!sameOrderedValues(dispositionIds, observationIds)) {
    violations.push(
      "evidence disposition manifest does not cover every observation exactly once"
    );
  }

  dispositions.forEach((disposition, index) => {
    const pieceId = getString(disposition, "canonicalPieceId");
    const outcome = getString(disposition, "outcome");
    const reason = getString(disposition, "reason");
    const reasonCode = getString(disposition, "reasonCode");
    const piece = pieceId ? pieceById.get(pieceId) : null;

    if (!reason || !reasonCode || !outcome) {
      violations.push(`evidence disposition[${index}] is incomplete`);
      return;
    }
    if (pieceId && !piece) {
      violations.push(
        `evidence disposition[${index}] targets missing piece ${pieceId}`
      );
      return;
    }
    if (
      (outcome === "canonical_entity" || outcome === "declared_detail") &&
      !piece?.outputEligible
    ) {
      violations.push(
        `evidence disposition[${index}] claims a non-output canonical owner`
      );
    }
  });

  return violations;
}

function rebuildDispositionManifest(
  observationIds: string[],
  pieces: CanonicalEvidencePiece[]
) {
  return observationIds.map((observationId) => {
    const owners = pieces.filter((piece) =>
      piece.observationIds.includes(observationId)
    );
    const owner = owners.find((piece) => piece.outputEligible) ?? owners[0] ?? null;

    return {
      canonicalPieceId: owner?.id ?? null,
      observationId,
      outcome: owner?.outputEligible ? "canonical_entity" : "evidence_only",
      reason: owner?.outputEligible
        ? "Rebuilt from the canonical evidence owner during bounded assembly recovery."
        : "Retained as evidence-only lineage during bounded assembly recovery.",
      reasonCode: owner?.outputEligible
        ? "canonical_entity"
        : "superseded_or_duplicate",
    };
  });
}

function artifactProjectionViolations({
  draft,
  pieces,
}: {
  draft: unknown;
  pieces: CanonicalEvidencePiece[];
}) {
  const record = asRecord(draft);
  const evidence = asRecord(getObject(record, "_evidence"));
  const violations: string[] = [];
  const artifactPieceIds = pieces.map((piece) => piece.id);
  const artifactEntityIds = pieces
    .filter((piece) => piece.outputEligible)
    .map((piece) => piece.id);
  const draftPieceIds = getArray(evidence, "canonicalPieceIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );
  const draftEntityIds = getArray(evidence, "canonicalEntityIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );

  if (!sameOrderedValues(draftPieceIds, artifactPieceIds)) {
    violations.push(
      "draft canonical piece manifest does not match persisted evidence artifacts"
    );
  }
  if (!sameOrderedValues(draftEntityIds, artifactEntityIds)) {
    violations.push(
      "draft canonical entity manifest does not match output-eligible evidence artifacts"
    );
  }
  violations.push(...dispositionManifestViolations({ evidence, pieces }));

  for (const { collection, kinds } of PIECE_COLLECTIONS) {
    const expected = pieces.filter(
      (piece) =>
        piece.outputEligible &&
        (kinds as readonly CanonicalEvidencePiece["kind"][]).includes(piece.kind)
    );
    const actual = getArray(record, collection).map(asRecord);
    const actualIds = actual.map((item) => getString(item, "_canonicalId") ?? "");

    if (!sameOrderedValues(actualIds, expected.map((piece) => piece.id))) {
      violations.push(
        `${collection} identity order does not match canonical evidence artifacts`
      );
      continue;
    }

    expected.forEach((piece, index) => {
      if (
        semanticSignature(actual[index]) !==
        semanticSignature(canonicalPiecePublicPayload(piece.payload))
      ) {
        violations.push(
          `${collection}[${index}] semantic payload does not match canonical evidence ${piece.id}`
        );
      }
    });
  }

  return violations;
}

function errorSummary(error: unknown) {
  const violations =
    error && typeof error === "object" && "violations" in error &&
    Array.isArray((error as { violations?: unknown }).violations)
      ? (error as { violations: unknown[] }).violations.filter(
          (value): value is string => typeof value === "string"
        )
      : [];

  return {
    message: error instanceof Error ? error.message : "Unknown assembly error.",
    name: error instanceof Error ? error.name : "UnknownError",
    violations,
  };
}

function isCanonicalAssemblyError(error: unknown) {
  return (
    error instanceof CanonicalIdentityInvariantError ||
    error instanceof CanonicalProjectionInvariantError ||
    error instanceof FinalizedCanonicalMutationError ||
    error instanceof NonCanonicalDraftError
  );
}

function dedupeCanonicalPieces(
  pieces: CanonicalEvidencePiece[],
  actions: string[]
) {
  const unique = new Map<string, CanonicalEvidencePiece>();
  const violations: string[] = [];

  for (const piece of pieces) {
    if (!piece.id) {
      violations.push("canonical evidence contains a piece without identity");
      continue;
    }

    const existing = unique.get(piece.id);
    if (!existing) {
      unique.set(piece.id, piece);
      continue;
    }

    if (pieceSignature(existing) !== pieceSignature(piece)) {
      violations.push(
        `canonical evidence identity ${piece.id} represents conflicting pieces`
      );
      continue;
    }

    actions.push(`deduplicated_identical_piece:${piece.id}`);
  }

  if (violations.length > 0) {
    throw new UnsafeCanonicalRepairError(violations);
  }

  return [...unique.values()];
}

export function prepareCanonicalEvidencePieces(
  pieces: CanonicalEvidencePiece[]
): PreparedCanonicalEvidencePieces {
  const recoveryActions: string[] = [];

  try {
    return {
      pieces: dedupeCanonicalPieces(pieces, recoveryActions),
      recoveryActions,
    };
  } catch (error) {
    const initialError =
      error instanceof UnsafeCanonicalRepairError
        ? new CanonicalIdentityInvariantError(error.violations)
        : error;

    throw recoveryFailure({
      actions: recoveryActions,
      initialError,
      retryError: error,
      stage: "repair",
    });
  }
}

export function materializeCanonicalEvidenceObservations({
  draft,
  observations,
}: {
  draft: unknown;
  observations: EvidenceObservation[];
}) {
  const evidence = asRecord(getObject(asRecord(draft), "_evidence"));
  const manifestObservationIds = getArray(evidence, "observationIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );
  const observationIds = observations.map((observation) => observation.id);
  const dispositions = getArray(evidence, "dispositions").map(asRecord);
  const violations: string[] = [];

  if (!sameOrderedValues(observationIds, manifestObservationIds)) {
    violations.push(
      "persisted evidence observations do not match the validated disposition manifest"
    );
  }
  if (dispositions.length !== observations.length) {
    violations.push(
      "validated disposition count does not match persisted evidence observations"
    );
  }

  const dispositionByObservationId = new Map<
    string,
    EvidenceObservationDisposition
  >();
  const validReasonCodes = new Set<
    EvidenceObservationDisposition["reasonCode"]
  >([
    "attached_detail",
    "cancelled",
    "canonical_entity",
    "grouped_child",
    "needs_identity_enrichment",
    "rejected",
    "source_context",
    "superseded",
    "superseded_or_duplicate",
    "weak_source_anchor",
  ]);
  for (const disposition of dispositions) {
    const observationId = getString(disposition, "observationId");
    const canonicalPieceId = getString(disposition, "canonicalPieceId");
    const outcome = getString(disposition, "outcome");
    const reason = getString(disposition, "reason");
    const reasonCode = getString(disposition, "reasonCode");

    if (
      !observationId ||
      !reason ||
      !validReasonCodes.has(
        reasonCode as EvidenceObservationDisposition["reasonCode"]
      ) ||
      (outcome !== "canonical_entity" &&
        outcome !== "declared_detail" &&
        outcome !== "evidence_only" &&
        outcome !== "maker_decision" &&
        outcome !== "sensitive_redaction")
    ) {
      violations.push("validated evidence disposition is incomplete");
      continue;
    }
    if (dispositionByObservationId.has(observationId)) {
      violations.push(`duplicate evidence disposition for ${observationId}`);
      continue;
    }

    dispositionByObservationId.set(observationId, {
      canonicalPieceId,
      outcome,
      reason,
      reasonCode: reasonCode as EvidenceObservationDisposition["reasonCode"],
    });
  }

  if (
    observations.some(
      (observation) => !dispositionByObservationId.has(observation.id)
    )
  ) {
    violations.push(
      "one or more persisted evidence observations lack a validated disposition"
    );
  }

  if (violations.length > 0) {
    const error = new CanonicalIdentityInvariantError(
      Array.from(new Set(violations))
    );
    throw recoveryFailure({
      actions: [],
      initialError: error,
      retryError: error,
      stage: "repair",
    });
  }

  return observations.map((observation) => ({
    ...observation,
    disposition: dispositionByObservationId.get(observation.id),
  }));
}

function rebuildDraftFromCanonicalPieces({
  draft,
  pieces,
}: {
  draft: unknown;
  pieces: CanonicalEvidencePiece[];
}) {
  const actions: string[] = [];
  const record = { ...asRecord(draft) };
  const evidence = getObject(record, "_evidence");
  const uniquePieces = dedupeCanonicalPieces(pieces, actions);
  const outputFor = (...kinds: CanonicalEvidencePiece["kind"][]) =>
    uniquePieces
      .filter(
        (piece) => piece.outputEligible && kinds.includes(piece.kind)
      )
      .map((piece) => ({
        ...canonicalPiecePublicPayload(piece.payload),
        _canonicalId: piece.id,
        _canonicalPieceId: piece.id,
      }));
  const outputPieces = uniquePieces.filter((piece) => piece.outputEligible);
  const observationIds = Array.from(
    new Set([
      ...getArray(evidence, "observationIds").filter(
        (value): value is string => typeof value === "string" && Boolean(value)
      ),
      ...uniquePieces.flatMap((piece) => piece.observationIds),
    ])
  );
  const dispositions = rebuildDispositionManifest(observationIds, uniquePieces);

  actions.push(
    "rebuilt_canonical_outputs_from_evidence",
    "regenerated_canonical_review_identity",
    "rebuilt_evidence_identity_manifest"
  );
  delete record._canonicalFinalization;

  return {
    actions: Array.from(new Set(actions)),
    draft: {
      ...record,
      activities: outputFor("activity", "note"),
      missingDetails: canonicalizeCanonicalReviewDetails(
        getArray(record, "missingDetails"),
        uniquePieces
      ),
      places: outputFor("place"),
      stays: outputFor("stay"),
      transport: outputFor("transport"),
      _evidence: {
        ...evidence,
        actions: uniquePieces.flatMap((piece) =>
          piece.actions.map((action) => ({
            ...action,
            canonicalPieceId: piece.id,
          }))
        ),
        canonicalEntityIds: outputPieces.map((piece) => piece.id),
        canonicalPieceIds: uniquePieces.map((piece) => piece.id),
        dispositions,
        observationIds,
        version: EVIDENCE_CLUSTER_VERSION,
      },
    },
  };
}

function recoveryFailure({
  actions,
  initialError,
  retryError,
  stage,
}: {
  actions: string[];
  initialError: unknown;
  retryError: unknown;
  stage: CanonicalAssemblyRecoveryFailureDetails["stage"];
}) {
  return new CanonicalAssemblyRecoveryError({
    actions,
    initialError: errorSummary(initialError),
    retryError: errorSummary(retryError),
    stage,
  });
}

export function assembleCanonicalTripDraft({
  draft,
  evidencePieces,
  fallbackTripName,
  priorRecoveryActions = [],
  tripId,
}: {
  draft: unknown;
  evidencePieces: CanonicalEvidencePiece[];
  fallbackTripName: string;
  priorRecoveryActions?: string[];
  tripId: string;
}): {
  draft: unknown;
  finalization: CanonicalFinalizationDebug;
  records: StructuredTripRecords;
  recovery: CanonicalAssemblyRecoverySummary;
} {
  let candidate = draft;
  let initialError: unknown = null;
  let recoveryActions: string[] = [...priorRecoveryActions];
  let finalization: ReturnType<typeof finalizeCanonicalTripDraft>;

  const recoverySummary = (): CanonicalAssemblyRecoverySummary => {
    const attempted =
      priorRecoveryActions.length > 0 || initialError !== null;
    return {
      actions: recoveryActions,
      attempted,
      initialViolations: Array.from(
        new Set([
          ...priorRecoveryActions.map(
            (action) => `evidence artifacts required ${action}`
          ),
          ...errorSummary(initialError).violations,
        ])
      ),
      status: attempted ? "repaired" : "not_needed",
    };
  };

  try {
    const artifactActions: string[] = [];
    const uniquePieces = dedupeCanonicalPieces(evidencePieces, artifactActions);
    const artifactViolations = artifactProjectionViolations({
      draft: candidate,
      pieces: uniquePieces,
    });

    if (artifactActions.length > 0 || artifactViolations.length > 0) {
      initialError = new CanonicalIdentityInvariantError([
        ...artifactViolations,
        ...artifactActions.map(
          (action) => `evidence artifacts required ${action}`
        ),
      ]);
      const repaired = rebuildDraftFromCanonicalPieces({
        draft: candidate,
        pieces: uniquePieces,
      });
      candidate = repaired.draft;
      recoveryActions = Array.from(
        new Set([
          ...priorRecoveryActions,
          ...artifactActions,
          ...repaired.actions,
        ])
      );
    }
  } catch (error) {
    throw recoveryFailure({
      actions: recoveryActions,
      initialError:
        error instanceof UnsafeCanonicalRepairError
          ? new CanonicalIdentityInvariantError(error.violations)
          : error,
      retryError: error,
      stage: "repair",
    });
  }

  try {
    finalization = finalizeCanonicalTripDraft(candidate);
  } catch (error) {
    if (!isCanonicalAssemblyError(error)) throw error;
    if (initialError !== null) {
      throw recoveryFailure({
        actions: recoveryActions,
        initialError,
        retryError: error,
        stage: "finalization",
      });
    }
    initialError = error;

    try {
      const repaired = rebuildDraftFromCanonicalPieces({
        draft: candidate,
        pieces: evidencePieces,
      });
      candidate = repaired.draft;
      recoveryActions = Array.from(
        new Set([...priorRecoveryActions, ...repaired.actions])
      );
      finalization = finalizeCanonicalTripDraft(candidate);
    } catch (retryError) {
      throw recoveryFailure({
        actions: recoveryActions,
        initialError,
        retryError,
        stage:
          retryError instanceof UnsafeCanonicalRepairError
            ? "repair"
            : "finalization",
      });
    }
  }

  candidate = finalization.draft;

  try {
    const records = createStructuredTripRecordsFromDraft({
      draft: candidate,
      fallbackTripName,
      tripId,
    });

    return {
      draft: candidate,
      finalization: finalization.debug,
      records,
      recovery: recoverySummary(),
    };
  } catch (error) {
    if (!isCanonicalAssemblyError(error)) throw error;
    if (initialError !== null) {
      throw recoveryFailure({
        actions: recoveryActions,
        initialError,
        retryError: error,
        stage: "compilation",
      });
    }

    initialError = error;
    let repaired: ReturnType<typeof rebuildDraftFromCanonicalPieces>;
    try {
      repaired = rebuildDraftFromCanonicalPieces({
        draft: candidate,
        pieces: evidencePieces,
      });
      recoveryActions = Array.from(
        new Set([...priorRecoveryActions, ...repaired.actions])
      );
      finalization = finalizeCanonicalTripDraft(repaired.draft);
    } catch (retryError) {
      throw recoveryFailure({
        actions: recoveryActions,
        initialError: error,
        retryError,
        stage:
          retryError instanceof UnsafeCanonicalRepairError
            ? "repair"
            : "finalization",
      });
    }

    try {
      const records = createStructuredTripRecordsFromDraft({
        draft: finalization.draft,
        fallbackTripName,
        tripId,
      });

      return {
        draft: finalization.draft,
        finalization: finalization.debug,
        records,
        recovery: recoverySummary(),
      };
    } catch (retryError) {
      throw recoveryFailure({
        actions: recoveryActions,
        initialError: error,
        retryError,
        stage: "compilation",
      });
    }
  }
}
