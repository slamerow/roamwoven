import { createHash } from "node:crypto";
import {
  finalizeCanonicalTripDraft,
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
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
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
    // Runs 7.23.0/7.23.0r/7.23.1 (three consecutive live parses): the
    // "activities identity order" violation fired every run because the
    // draft emits GROUPED collections (all activity-kind pieces, then all
    // note-kind pieces — outputFor composition at cluster time) while this
    // check expected the two kinds INTERLEAVED in raw piece order. The two
    // orders agreed only while every note piece happened to sit after
    // every activity piece; the Arc E fold guard legitimately changed
    // which pieces demote to notes and the accident stopped holding. One
    // ordering rule everywhere: collections are grouped by the
    // collection's kind list, in piece order within each kind — here, in
    // the cluster emitter, and in the rebuild path.
    const expected = (
      kinds as readonly CanonicalEvidencePiece["kind"][]
    ).flatMap((kind) =>
      pieces.filter((piece) => piece.outputEligible && piece.kind === kind)
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

// Arc E containment note: the former isCanonicalAssemblyError gate is gone
// on purpose — EVERY assembly-corridor failure (canonical invariant or raw
// exception) flows through the same bounded rebuild+retry and terminates,
// at worst, in a named recovery state. Raw errors never escape untyped.

function recoveredPieceId({
  originalId,
  piece,
  salt = 0,
}: {
  originalId: string;
  piece: CanonicalEvidencePiece;
  salt?: number;
}) {
  return `piece_${createHash("sha256")
    .update(JSON.stringify({
      collisionIdentityVersion: 1,
      originalId,
      pieceSignature: pieceSignature(piece),
      salt,
    }))
    .digest("hex")
    .slice(0, 24)}`;
}

function collisionKeeperRank(piece: CanonicalEvidencePiece) {
  return (
    (piece.payload._canonicalGroupRole === "parent" ? 8 : 0) +
    (piece.outputEligible ? 4 : 0) +
    (piece.payload._canonicalNoteEntry === true ? 0 : 2) +
    (piece.role === "atomic_candidate" ? 1 : 0)
  );
}

function sameObservationLineage(
  left: CanonicalEvidencePiece,
  right: CanonicalEvidencePiece
) {
  return sameOrderedValues(
    [...left.observationIds].sort(),
    [...right.observationIds].sort()
  );
}

function repairCanonicalPieceIdentities(
  pieces: CanonicalEvidencePiece[],
  actions: string[]
) {
  const repaired = structuredClone(pieces);
  const usedIds = new Set(
    repaired.map((piece) => piece.id).filter((id): id is string => Boolean(id))
  );
  const missingIdBySignature = new Map<string, string>();

  for (const piece of repaired) {
    if (!piece.id) {
      const signature = pieceSignature(piece);
      const sharedId = missingIdBySignature.get(signature);
      if (sharedId) {
        piece.id = sharedId;
        actions.push(`recovered_missing_piece_identity:${sharedId}`);
        continue;
      }

      let salt = 0;
      let nextId = recoveredPieceId({
        originalId: "missing",
        piece,
        salt,
      });
      while (usedIds.has(nextId)) {
        salt += 1;
        nextId = recoveredPieceId({ originalId: "missing", piece, salt });
      }
      piece.id = nextId;
      usedIds.add(nextId);
      missingIdBySignature.set(signature, nextId);
      actions.push(`recovered_missing_piece_identity:${nextId}`);
    }
  }

  const groups = new Map<string, CanonicalEvidencePiece[]>();
  for (const piece of repaired) {
    groups.set(piece.id, [...(groups.get(piece.id) ?? []), piece]);
  }

  const retained = new Set<CanonicalEvidencePiece>();

  for (const [originalId, group] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const bySignature = new Map<string, CanonicalEvidencePiece[]>();
    for (const piece of group) {
      const signature = pieceSignature(piece);
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), piece]);
    }

    const uniquePieces = [...bySignature.entries()]
      .map(([signature, matching]) => {
        matching.slice(1).forEach(() =>
          actions.push(`deduplicated_identical_piece:${originalId}`)
        );
        return { piece: matching[0], signature };
      })
      .sort((left, right) =>
        collisionKeeperRank(right.piece) - collisionKeeperRank(left.piece) ||
        left.signature.localeCompare(right.signature)
      );

    const keeper = uniquePieces[0];
    if (!keeper) continue;
    retained.add(keeper.piece);

    for (const { piece, signature } of uniquePieces.slice(1)) {
      const sameSemanticPayload =
        semanticSignature(canonicalPiecePublicPayload(keeper.piece.payload)) ===
        semanticSignature(canonicalPiecePublicPayload(piece.payload));
      if (
        keeper.piece.outputEligible &&
        piece.outputEligible &&
        (sameObservationLineage(keeper.piece, piece) || sameSemanticPayload)
      ) {
        piece.outputEligible = false;
        piece.actions.push({
          absorbedTitles: [],
          observationIds: [...piece.observationIds],
          reason:
            "Conflicting duplicate identity was preserved as evidence-only during deterministic assembly recovery.",
          type: "rejected",
        });
        actions.push(
          `preserved_conflicting_piece_as_evidence_only:${originalId}`
        );
      }

      let salt = 0;
      let nextId = recoveredPieceId({ originalId, piece, salt });
      while (usedIds.has(nextId)) {
        salt += 1;
        nextId = recoveredPieceId({ originalId, piece, salt });
      }

      piece.id = nextId;
      usedIds.add(nextId);
      retained.add(piece);
      actions.push(
        [
          "rekeyed_conflicting_piece",
          originalId,
          piece.kind,
          piece.role,
          piece.outputEligible ? "output" : "lineage",
          signature.slice(0, 12),
          nextId,
        ].join(":")
      );
    }
  }

  return repaired.filter((piece) => retained.has(piece));
}

export function prepareCanonicalEvidencePieces(
  pieces: CanonicalEvidencePiece[]
): PreparedCanonicalEvidencePieces {
  const recoveryActions: string[] = [];

  return {
    pieces: repairCanonicalPieceIdentities(pieces, recoveryActions),
    recoveryActions,
  };
}

export function materializeCanonicalEvidenceObservations({
  draft,
  observations,
  pieces,
}: {
  draft: unknown;
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  const evidence = asRecord(getObject(asRecord(draft), "_evidence"));
  const manifestObservationIds = getArray(evidence, "observationIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );
  const observationIds = Array.from(new Set([
    ...manifestObservationIds,
    ...observations.map((observation) => observation.id),
    ...pieces.flatMap((piece) => piece.observationIds),
  ]));
  const dispositions = getArray(evidence, "dispositions").map(asRecord);
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const fallbackDispositionByObservationId = new Map(
    rebuildDispositionManifest(observationIds, pieces).map((disposition) => [
      disposition.observationId,
      disposition,
    ])
  );

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
      continue;
    }
    if (dispositionByObservationId.has(observationId)) {
      continue;
    }
    const owner = canonicalPieceId ? pieceById.get(canonicalPieceId) : null;
    if (canonicalPieceId && !owner) continue;
    if (
      (outcome === "canonical_entity" || outcome === "declared_detail") &&
      !owner?.outputEligible
    ) {
      continue;
    }

    dispositionByObservationId.set(observationId, {
      canonicalPieceId,
      outcome,
      reason,
      reasonCode: reasonCode as EvidenceObservationDisposition["reasonCode"],
    });
  }

  const observationById = new Map<string, EvidenceObservation>();
  for (const observation of observations) {
    if (!observationById.has(observation.id)) {
      observationById.set(observation.id, observation);
    }
  }

  const ownerFor = (observationId: string) =>
    pieces.find((piece) => piece.observationIds.includes(observationId)) ?? null;

  return observationIds.map((observationId, index) => {
    const owner = ownerFor(observationId);
    const existing = observationById.get(observationId);
    const fallbackDisposition = fallbackDispositionByObservationId.get(
      observationId
    ) as EvidenceObservationDisposition | undefined;

    return {
      ...(existing ?? {
        id: observationId,
        kind: owner?.kind ?? "context",
        ordinal: index + 1,
        payload: {
          ...(owner?.payload ?? {}),
          _canonicalRecoveryReason: "missing_observation_artifact",
        },
        role: owner?.role ?? "context",
        source: "model_spine",
        sourceFilename:
          typeof owner?.payload.sourceFilename === "string"
            ? owner.payload.sourceFilename
            : null,
        sourceLabel: "Recovered canonical evidence",
        sourceProvenance: "canonical_assembly_recovery",
        sourceStructure: {
          headingPath: [],
          sectionLabel: null,
          sectionType: "unknown",
        },
        sourceUploadId: null,
      } satisfies EvidenceObservation),
      disposition:
        dispositionByObservationId.get(observationId) ?? fallbackDisposition,
    };
  });
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
  const uniquePieces = repairCanonicalPieceIdentities(pieces, actions);
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
      // Same grouped ordering rule as the cluster emitter and the artifact
      // inspection: activity-kind pieces first, then note-kind (7.23.1).
      activities: [...outputFor("activity"), ...outputFor("note")],
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
    const uniquePieces = repairCanonicalPieceIdentities(
      evidencePieces,
      artifactActions
    );
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
    // Arc E containment (dark-factory totality): an unexpected raw
    // exception while inspecting the draft's artifact projection gets the
    // SAME bounded repair a detected violation gets — the rebuild reads
    // only the canonical pieces, so it is immune to whatever malformed
    // draft shape threw. Terminal only when the rebuild itself cannot run.
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
    } catch (repairError) {
      throw recoveryFailure({
        actions: recoveryActions,
        initialError: error,
        retryError: repairError,
        stage: "repair",
      });
    }
  }

  try {
    finalization = finalizeCanonicalTripDraft(candidate);
  } catch (error) {
    // Arc E containment: raw non-canonical exceptions no longer escape the
    // repair corridor (they used to rethrow here and die as an untyped
    // extraction failure with no repair attempt). Every error class flows
    // through the same bounded rebuild+retry; errorSummary preserves the
    // real name/message/violations in the recovery event either way.
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
          retryError instanceof CanonicalIdentityInvariantError
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
    // Arc E containment: compilation failures — canonical OR raw — follow
    // the same bounded rebuild+retry as finalization failures.
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
          retryError instanceof CanonicalIdentityInvariantError
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
