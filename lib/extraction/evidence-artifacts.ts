import type {
  CanonicalEvidenceAction,
  CanonicalEvidencePiece,
  EvidenceKind,
  EvidenceObservation,
  EvidenceObservationDisposition,
  EvidenceRole,
  EvidenceSource,
  EvidenceSourceStructure,
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

export type EvidenceArtifactBundle = {
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function evidenceRole(value: unknown, fallback: EvidenceRole): EvidenceRole {
  return value === "accessory_detail" ||
    value === "atomic_candidate" ||
    value === "city_note_candidate" ||
    value === "context" ||
    value === "grouping_proposal" ||
    value === "rejected"
    ? value
    : fallback;
}

function sourceStructure(value: unknown): EvidenceSourceStructure {
  const record = asRecord(value);
  const sectionType = record.sectionType;

  return {
    headingPath: stringArray(record.headingPath),
    sectionLabel:
      typeof record.sectionLabel === "string" ? record.sectionLabel : null,
    sectionType:
      sectionType === "booking_detail" ||
      sectionType === "city_reference" ||
      sectionType === "dated_itinerary"
        ? sectionType
        : "unknown",
  };
}

function evidenceDisposition(value: unknown) {
  const record = asRecord(value);
  const outcome = record.outcome;
  const reasonCode = record.reasonCode;

  if (
    (outcome !== "canonical_entity" &&
      outcome !== "declared_detail" &&
      outcome !== "evidence_only" &&
      outcome !== "maker_decision" &&
      outcome !== "sensitive_redaction") ||
    typeof record.reason !== "string" ||
    typeof reasonCode !== "string"
  ) {
    return undefined;
  }

  return {
    canonicalPieceId:
      typeof record.canonicalPieceId === "string"
        ? record.canonicalPieceId
        : null,
    outcome,
    reason: record.reason,
    reasonCode,
  } as EvidenceObservationDisposition;
}

export async function getEvidenceArtifacts({
  processingRunId,
  tripId,
}: {
  processingRunId: string;
  tripId: string;
}): Promise<EvidenceArtifactBundle | null> {
  const supabase = await createSupabaseServerClient();
  const [observationsResult, piecesResult] = await Promise.all([
    supabase
      .from("trip_evidence_observations")
      .select(
        "evidence_kind,observation_id,ordinal,payload_json,source_filename,source_label,source_provenance,source_type,source_upload_id"
      )
      .eq("processing_run_id", processingRunId)
      .eq("trip_id", tripId)
      .order("ordinal", { ascending: true }),
    supabase
      .from("trip_canonical_pieces")
      .select(
        "canonical_piece_id,confidence,conflicts_json,evidence_kind,field_sources_json,merge_reasons,observation_ids,output_eligible,payload_json"
      )
      .eq("processing_run_id", processingRunId)
      .eq("trip_id", tripId),
  ]);

  if (observationsResult.error || piecesResult.error) {
    const error = observationsResult.error ?? piecesResult.error;

    if (isMissingEvidenceTable(error)) {
      return null;
    }

    throw persistenceError("Unable to load evidence artifacts", error);
  }

  if (
    (observationsResult.data?.length ?? 0) === 0 &&
    (piecesResult.data?.length ?? 0) === 0
  ) {
    return null;
  }

  const observations = (observationsResult.data ?? []).map((row) => {
    const payload = asRecord(row.payload_json);
    const meta = asRecord(payload._evidenceMeta);
    delete payload._evidenceMeta;
    const kind = row.evidence_kind as EvidenceKind;

    return {
      disposition: evidenceDisposition(meta.disposition),
      id: String(row.observation_id),
      kind,
      ordinal: Number(row.ordinal) || 0,
      payload,
      role: evidenceRole(
        meta.role,
        kind === "context"
          ? "context"
          : kind === "note"
            ? "city_note_candidate"
            : "atomic_candidate"
      ),
      source: row.source_type as EvidenceSource,
      sourceFilename:
        typeof row.source_filename === "string" ? row.source_filename : null,
      sourceLabel:
        typeof row.source_label === "string" ? row.source_label : "source",
      sourceProvenance:
        typeof row.source_provenance === "string"
          ? row.source_provenance
          : null,
      sourceStructure: sourceStructure(meta.sourceStructure),
      sourceUploadId:
        typeof row.source_upload_id === "string" ? row.source_upload_id : null,
    } satisfies EvidenceObservation;
  });
  const pieces = (piecesResult.data ?? []).map((row) => {
    const payload = asRecord(row.payload_json);
    const meta = asRecord(payload._canonicalMeta);
    delete payload._canonicalMeta;
    const actions = Array.isArray(meta.actions)
      ? (meta.actions as CanonicalEvidenceAction[])
      : [];
    const fieldWinnerRanks = Object.fromEntries(
      Object.entries(asRecord(meta.fieldWinnerRanks)).map(([key, value]) => [
        key,
        Number(value) || 0,
      ])
    );
    const kind = row.evidence_kind as EvidenceKind;

    return {
      actions,
      confidence: row.confidence === "high" ? "high" : "medium",
      conflicts: Array.isArray(row.conflicts_json) ? row.conflicts_json : [],
      fieldSources: Object.fromEntries(
        Object.entries(asRecord(row.field_sources_json)).map(([key, value]) => [
          key,
          stringArray(value),
        ])
      ),
      fieldWinnerRanks,
      id: String(row.canonical_piece_id),
      kind,
      mergeReasons: stringArray(row.merge_reasons),
      observationIds: stringArray(row.observation_ids),
      outputEligible: row.output_eligible === true,
      payload,
      role: evidenceRole(
        meta.role,
        kind === "context"
          ? "context"
          : kind === "note"
            ? "city_note_candidate"
            : "atomic_candidate"
      ),
    } satisfies CanonicalEvidencePiece;
  });

  return { observations, pieces };
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
        payload_json: {
          ...observation.payload,
          _evidenceMeta: {
            disposition: observation.disposition,
            role: observation.role,
            sourceStructure: observation.sourceStructure,
          },
        },
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
        payload_json: {
          ...piece.payload,
          _canonicalMeta: {
            actions: piece.actions,
            fieldWinnerRanks: piece.fieldWinnerRanks,
            role: piece.role,
          },
        },
        processing_run_id: processingRunId,
        trip_id: tripId,
      }))
    );

    if (error) {
      throw persistenceError("Unable to save canonical evidence pieces", error);
    }
  }

  return {
    dispositionCount: observations.filter((observation) => observation.disposition)
      .length,
    observationCount: observations.length,
    outputPieceCount: pieces.filter((piece) => piece.outputEligible).length,
    pieceCount: pieces.length,
  };
}
