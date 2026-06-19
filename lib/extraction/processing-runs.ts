import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TripProcessingRun = {
  id: string;
  completedAt: string | null;
  createdAt: string | null;
  errorMessage: string | null;
  inputCharCount: number;
  idempotencyKey: string | null;
  model: string | null;
  openaiUsage: unknown;
  runType: string;
  sourceUploadIds: string[];
  status: string;
  tripId: string;
};

export type TripDraftSnapshot = {
  id: string;
  createdAt: string | null;
  draftJson: unknown;
  processingRunId: string | null;
  source: string;
  tripId: string;
};

type TripProcessingRunRow = {
  id: string;
  completed_at: string | null;
  created_at: string | null;
  error_message: string | null;
  input_char_count: number | null;
  idempotency_key: string | null;
  model: string | null;
  openai_usage: unknown;
  run_type: string | null;
  source_upload_ids: unknown;
  status: string | null;
  trip_id: string;
};

type TripDraftSnapshotRow = {
  id: string;
  created_at: string | null;
  draft_json: unknown;
  processing_run_id: string | null;
  source: string | null;
  trip_id: string;
};

export class DuplicateProcessingRunError extends Error {
  existingRun: TripProcessingRun | null;

  constructor(existingRun: TripProcessingRun | null) {
    super("A processing run for these exact materials already exists.");
    this.name = "DuplicateProcessingRunError";
    this.existingRun = existingRun;
  }
}

function normalizeRun(row: TripProcessingRunRow): TripProcessingRun {
  return {
    id: row.id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    inputCharCount: row.input_char_count ?? 0,
    idempotencyKey: row.idempotency_key,
    model: row.model,
    openaiUsage: row.openai_usage ?? null,
    runType: row.run_type ?? "initial_parse",
    sourceUploadIds: Array.isArray(row.source_upload_ids)
      ? row.source_upload_ids.filter(
          (value): value is string => typeof value === "string"
        )
      : [],
    status: row.status ?? "pending",
    tripId: row.trip_id,
  };
}

function normalizeSnapshot(row: TripDraftSnapshotRow): TripDraftSnapshot {
  return {
    id: row.id,
    createdAt: row.created_at,
    draftJson: row.draft_json,
    processingRunId: row.processing_run_id,
    source: row.source ?? "openai_initial_parse",
    tripId: row.trip_id,
  };
}

async function getTripProcessingRunByIdempotencyKey({
  idempotencyKey,
  tripId,
}: {
  idempotencyKey: string;
  tripId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_processing_runs")
    .select(
      [
        "id",
        "completed_at",
        "created_at",
        "error_message",
        "idempotency_key",
        "input_char_count",
        "model",
        "openai_usage",
        "run_type",
        "source_upload_ids",
        "status",
        "trip_id",
      ].join(",")
    )
    .eq("trip_id", tripId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ? normalizeRun(data as unknown as TripProcessingRunRow) : null;
}

export async function createTripProcessingRun({
  idempotencyKey,
  inputCharCount,
  sourceUploadIds,
  tripId,
}: {
  idempotencyKey: string;
  inputCharCount: number;
  sourceUploadIds: string[];
  tripId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_processing_runs")
    .insert({
      idempotency_key: idempotencyKey,
      input_char_count: inputCharCount,
      run_type: "initial_parse",
      source_upload_ids: sourceUploadIds,
      status: "processing",
      trip_id: tripId,
    })
    .select(
      [
        "id",
        "completed_at",
        "created_at",
        "error_message",
        "idempotency_key",
        "input_char_count",
        "model",
        "openai_usage",
        "run_type",
        "source_upload_ids",
        "status",
        "trip_id",
      ].join(",")
    )
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new DuplicateProcessingRunError(
        await getTripProcessingRunByIdempotencyKey({ idempotencyKey, tripId })
      );
    }

    throw new Error(`Unable to create processing run: ${error?.message ?? "No row"}`);
  }

  await supabase
    .from("trips")
    .update({
      processing_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId);

  return normalizeRun(data as unknown as TripProcessingRunRow);
}

export async function completeTripProcessingRun({
  draftJson,
  model,
  runId,
  tripId,
  usage,
}: {
  draftJson: unknown;
  model: string;
  runId: string;
  tripId: string;
  usage: unknown;
}) {
  const supabase = await createSupabaseServerClient();
  const completedAt = new Date().toISOString();

  const { error: runError } = await supabase
    .from("trip_processing_runs")
    .update({
      completed_at: completedAt,
      model,
      openai_usage: usage,
      status: "completed",
    })
    .eq("id", runId);

  if (runError) {
    throw new Error(`Unable to complete processing run: ${runError.message}`);
  }

  const { data, error: snapshotError } = await supabase
    .from("trip_draft_snapshots")
    .insert({
      draft_json: draftJson,
      processing_run_id: runId,
      source: "openai_initial_parse",
      trip_id: tripId,
    })
    .select("id,created_at,draft_json,processing_run_id,source,trip_id")
    .single();

  if (snapshotError || !data) {
    throw new Error(
      `Unable to save draft snapshot: ${snapshotError?.message ?? "No row"}`
    );
  }

  await supabase
    .from("trips")
    .update({
      processing_status: "parsed",
      updated_at: completedAt,
    })
    .eq("id", tripId);

  return normalizeSnapshot(data as unknown as TripDraftSnapshotRow);
}

export async function failTripProcessingRun({
  errorMessage,
  runId,
  tripId,
}: {
  errorMessage: string;
  runId: string;
  tripId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const completedAt = new Date().toISOString();

  await supabase
    .from("trip_processing_runs")
    .update({
      completed_at: completedAt,
      error_message: errorMessage.slice(0, 1000),
      status: "failed",
    })
    .eq("id", runId);

  await supabase
    .from("trips")
    .update({
      processing_status: "failed",
      updated_at: completedAt,
    })
    .eq("id", tripId);
}

export async function getLatestTripProcessingRun(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_processing_runs")
    .select(
      [
        "id",
        "completed_at",
        "created_at",
        "error_message",
        "idempotency_key",
        "input_char_count",
        "model",
        "openai_usage",
        "run_type",
        "source_upload_ids",
        "status",
        "trip_id",
      ].join(",")
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return null;
    }

    throw new Error(`Unable to load processing run: ${error.message}`);
  }

  return data ? normalizeRun(data as unknown as TripProcessingRunRow) : null;
}

export async function getLatestTripDraftSnapshot(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_draft_snapshots")
    .select("id,created_at,draft_json,processing_run_id,source,trip_id")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return null;
    }

    throw new Error(`Unable to load draft snapshot: ${error.message}`);
  }

  return data ? normalizeSnapshot(data as unknown as TripDraftSnapshotRow) : null;
}
