import type {
  CanonicalEvidencePiece,
  EvidenceObservation,
} from "@/lib/extraction/evidence-clustering";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isMissingEvidenceTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function persistenceError(
  label: string,
  error: { code?: string; message?: string } | null
) {
  if (isMissingEvidenceTable(error)) {
    return new Error(
      "Canonical evidence persistence is not installed. Apply the additive OCR/evidence foundations SQL before running extraction."
    );
  }

  return new Error(`${label}: ${error?.message ?? "Unknown database error"}`);
}

function countKinds(rows: Array<{ evidence_kind?: unknown }>) {
  return rows.reduce((counts, row) => {
    const kind =
      typeof row.evidence_kind === "string" ? row.evidence_kind : "unknown";
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

export async function getEvidenceArtifactSummary({
  processingRunId,
  tripId,
}: {
  processingRunId: string;
  tripId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const [observationsResult, piecesResult] = await Promise.all([
    supabase
      .from("trip_evidence_observations")
      .select("evidence_kind,observation_id")
      .eq("processing_run_id", processingRunId)
      .eq("trip_id", tripId),
    supabase
      .from("trip_canonical_pieces")
      .select("conflicts_json,evidence_kind,observation_ids,output_eligible")
      .eq("processing_run_id", processingRunId)
      .eq("trip_id", tripId),
  ]);

  if (observationsResult.error || piecesResult.error) {
    const error = observationsResult.error ?? piecesResult.error;

    if (isMissingEvidenceTable(error)) {
      return null;
    }

    throw persistenceError("Unable to load evidence artifact summary", error);
  }

  const observations = (observationsResult.data ?? []) as Array<{
    evidence_kind?: unknown;
    observation_id?: unknown;
  }>;
  const pieces = (piecesResult.data ?? []) as Array<{
    conflicts_json?: unknown;
    evidence_kind?: unknown;
    observation_ids?: unknown;
    output_eligible?: unknown;
  }>;

  return {
    byObservationKind: countKinds(observations),
    byPieceKind: countKinds(pieces),
    conflictPieceCount: pieces.filter(
      (piece) => Array.isArray(piece.conflicts_json) && piece.conflicts_json.length > 0
    ).length,
    clusteredObservationCount: pieces.reduce(
      (count, piece) =>
        count +
        Math.max(
          0,
          (Array.isArray(piece.observation_ids)
            ? piece.observation_ids.length
            : 0) - 1
        ),
      0
    ),
    observationCount: observations.length,
    outputPieceCount: pieces.filter((piece) => piece.output_eligible === true).length,
    pieceCount: pieces.length,
  };
}

export async function persistEvidenceArtifacts({
  observations,
  pieces,
  processingRunId,
  tripId,
}: {
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
  processingRunId: string;
  tripId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error: observationDeleteError } = await supabase
    .from("trip_evidence_observations")
    .delete()
    .eq("processing_run_id", processingRunId)
    .eq("trip_id", tripId);

  if (observationDeleteError) {
    throw persistenceError(
      "Unable to reset evidence observations",
      observationDeleteError
    );
  }

  const { error: pieceDeleteError } = await supabase
    .from("trip_canonical_pieces")
    .delete()
    .eq("processing_run_id", processingRunId)
    .eq("trip_id", tripId);

  if (pieceDeleteError) {
    throw persistenceError("Unable to reset canonical pieces", pieceDeleteError);
  }

  if (observations.length > 0) {
    const { error } = await supabase.from("trip_evidence_observations").insert(
      observations.map((observation) => ({
        evidence_kind: observation.kind,
        observation_id: observation.id,
        ordinal: observation.ordinal,
        payload_json: observation.payload,
        processing_run_id: processingRunId,
        source_filename: observation.sourceFilename,
        source_label: observation.sourceLabel,
        source_provenance: observation.sourceProvenance,
        source_type: observation.source,
        source_upload_id: observation.sourceUploadId,
        trip_id: tripId,
      }))
    );

    if (error) {
      throw persistenceError("Unable to save evidence observations", error);
    }
  }

  if (pieces.length > 0) {
    const { error } = await supabase.from("trip_canonical_pieces").insert(
      pieces.map((piece) => ({
        canonical_piece_id: piece.id,
        confidence: piece.confidence,
        conflicts_json: piece.conflicts,
        evidence_kind: piece.kind,
        field_sources_json: piece.fieldSources,
        merge_reasons: piece.mergeReasons,
        observation_ids: piece.observationIds,
        output_eligible: piece.outputEligible,
        payload_json: piece.payload,
        processing_run_id: processingRunId,
        trip_id: tripId,
      }))
    );

    if (error) {
      throw persistenceError("Unable to save canonical evidence pieces", error);
    }
  }

  return {
    observationCount: observations.length,
    outputPieceCount: pieces.filter((piece) => piece.outputEligible).length,
    pieceCount: pieces.length,
  };
}
