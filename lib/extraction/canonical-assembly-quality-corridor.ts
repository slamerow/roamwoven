import {
  assembleCanonicalTripDraft,
  materializeCanonicalEvidenceObservations,
  type prepareCanonicalEvidencePieces,
} from "@/lib/extraction/canonical-trip-assembly";
import {
  reapplyCanonicalOutputInvariants,
  type CanonicalEvidencePiece,
  type EvidenceObservation,
} from "@/lib/extraction/evidence-clustering";
import type { EvidenceArtifactBundle } from "@/lib/extraction/evidence-artifacts";
import { getSourceTransportAnchorsFromDraft } from "@/lib/extraction/source-transport-anchors";
import {
  assessTripDraftQuality,
} from "@/lib/extraction/trip-quality-assessment";
import { createTripQualityOutcomes } from "@/lib/extraction/trip-quality-outcomes";

type PreparedCanonicalEvidence = ReturnType<
  typeof prepareCanonicalEvidencePieces
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function hasSeriousTripQualityFindings(
  assessment: ReturnType<typeof assessTripDraftQuality>
) {
  return Boolean(
    assessment.p0Diagnostics.length ||
      assessment.p1Diagnostics.length ||
      assessment.hardWarnings.length ||
      assessment.quietWarnings.some(
        (warning) => warning.code === "activity_bloat"
      )
  );
}

function materializeObservations({
  assembly,
  sourceObservations,
  pieces,
}: {
  assembly: ReturnType<typeof assembleCanonicalTripDraft>;
  sourceObservations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  return materializeCanonicalEvidenceObservations({
    draft: assembly.draft,
    observations: sourceObservations,
    pieces,
  });
}

function usageForBoundary({
  assembly,
  baseUsage,
  observations,
  pieces,
  qualityRemediation,
}: {
  assembly: ReturnType<typeof assembleCanonicalTripDraft>;
  baseUsage: unknown;
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
  qualityRemediation?: {
    retryAttempted: boolean;
    retryChanged: boolean;
  };
}) {
  const usage = asRecord(baseUsage);
  const recoveredObservationCount = observations.filter(
    (observation) =>
      observation.sourceProvenance === "canonical_assembly_recovery"
  ).length;

  return {
    ...usage,
    evidence: {
      ...asRecord(usage.evidence),
      canonicalPieceCount: pieces.filter((piece) => piece.outputEligible).length,
      dispositionCount: observations.length,
      recoveredObservationCount,
    },
    finalization: assembly.finalization,
    identityRecovery: assembly.recovery,
    ...(qualityRemediation ? { qualityRemediation } : {}),
  };
}

/**
 * The one route-equivalent canonical assembly/rebuild/quality corridor.
 *
 * Production and offline replay must call this function. It deliberately owns
 * the single bounded retry and final re-audit so a replay cannot score the
 * pre-retry assembly while production persists the post-retry assembly.
 */
export function runCanonicalAssemblyQualityCorridor({
  baseUsage,
  draft,
  fallbackTripName,
  onPhase,
  preparedEvidence,
  sourceEvidenceArtifacts,
  tripId,
}: {
  baseUsage: unknown;
  draft: unknown;
  fallbackTripName: string;
  onPhase?: (
    phase: "assembly" | "evidence_cluster" | "quality_assessment"
  ) => void;
  preparedEvidence: PreparedCanonicalEvidence;
  sourceEvidenceArtifacts: EvidenceArtifactBundle;
  tripId: string;
}) {
  const initialPieces = preparedEvidence.pieces;
  let pieces = initialPieces;
  onPhase?.("assembly");
  let assembly = assembleCanonicalTripDraft({
    draft,
    evidencePieces: pieces,
    fallbackTripName,
    priorRecoveryActions: preparedEvidence.recoveryActions,
    tripId,
  });

  onPhase?.("evidence_cluster");
  const initialObservations = materializeObservations({
    assembly,
    pieces,
    sourceObservations: sourceEvidenceArtifacts.observations,
  });
  const initialUsage = usageForBoundary({
    assembly,
    baseUsage,
    observations: initialObservations,
    pieces,
  });
  onPhase?.("quality_assessment");
  const initialAssessment = assessTripDraftQuality({
    draft: assembly.draft,
    evidenceArtifacts: {
      observations: initialObservations,
      pieces,
    },
    records: assembly.records,
    usage: initialUsage,
  });
  const retryAttempted = hasSeriousTripQualityFindings(initialAssessment);
  let retryChanged = false;

  if (retryAttempted) {
    const sensitiveDetails = Array.isArray(asRecord(assembly.draft).sensitiveDetails)
      ? (asRecord(assembly.draft).sensitiveDetails as unknown[])
      : [];
    const retry = reapplyCanonicalOutputInvariants({
      pieces,
      sensitiveDetails,
      sourceTransportAnchors: getSourceTransportAnchorsFromDraft(
        assembly.draft
      ),
    });
    retryChanged = retry.changed;

    if (retryChanged) {
      pieces = retry.pieces;
      const clearedTransportFields = retry.transportFieldRepairs.filter(
        (repair) => repair.outcome === "cleared_pending_review"
      );
      onPhase?.("assembly");
      assembly = assembleCanonicalTripDraft({
        draft: assembly.draft,
        evidencePieces: pieces,
        fallbackTripName,
        priorRecoveryActions: [
          ...preparedEvidence.recoveryActions,
          "reapplied_canonical_output_invariants",
          ...clearedTransportFields.map(
            (repair) =>
              `cleared_impossible_transport_${repair.field}_without_question:${repair.routeLabel}`
          ),
        ],
        tripId,
      });
    }
  }

  onPhase?.("evidence_cluster");
  const observations = materializeObservations({
    assembly,
    pieces,
    sourceObservations: sourceEvidenceArtifacts.observations,
  });
  const usage = usageForBoundary({
    assembly,
    baseUsage,
    observations,
    pieces,
    qualityRemediation: { retryAttempted, retryChanged },
  });
  onPhase?.("quality_assessment");
  const assessment = assessTripDraftQuality({
    draft: assembly.draft,
    evidenceArtifacts: { observations, pieces },
    records: assembly.records,
    usage,
  });
  const remediationOutcomes = createTripQualityOutcomes({
    finalPieces: pieces,
    finalReport: assessment.report,
    initialPieces,
    initialReport: initialAssessment.report,
    records: assembly.records,
  });

  return {
    assembly,
    assessment,
    initialAssessment,
    initialObservations,
    initialPieces,
    initialUsage,
    observations,
    pieces,
    remediationOutcomes,
    retryAttempted,
    retryChanged,
    usage: {
      ...usage,
      qualityRemediation: {
        outcomes: remediationOutcomes,
        retryAttempted,
        retryChanged,
      },
    },
  };
}
