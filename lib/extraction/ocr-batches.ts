import { createSupabaseServerClient } from "@/lib/supabase/server";

export const OCR_PROMPT_VERSION = "page-coverage-v1";

export type OcrBatchStatus = "completed" | "failed" | "incomplete" | "processing";

export type OcrBatchCheckpoint = {
  attemptCount: number;
  completedAt: string | null;
  errorMessage: string | null;
  id: string;
  incompleteReason: string | null;
  materialExtractionId: string;
  maxOutputTokens: number;
  model: string | null;
  outputCharCount: number;
  pageEnd: number;
  pageStart: number;
  promptVersion: string;
  sourceSha256: string;
  status: OcrBatchStatus;
  textContent: string | null;
  tripId: string;
  updatedAt: string | null;
  uploadId: string;
  usage: unknown;
};

type OcrBatchRow = {
  attempt_count: number | null;
  completed_at: string | null;
  error_message: string | null;
  id: string;
  incomplete_reason: string | null;
  material_extraction_id: string;
  max_output_tokens: number | null;
  model: string | null;
  output_char_count: number | null;
  page_end: number;
  page_start: number;
  prompt_version: string;
  source_sha256: string;
  status: string;
  text_content: string | null;
  trip_id: string;
  updated_at: string | null;
  upload_id: string;
  usage: unknown;
};

const ocrBatchColumns = [
  "attempt_count",
  "completed_at",
  "error_message",
  "id",
  "incomplete_reason",
  "material_extraction_id",
  "max_output_tokens",
  "model",
  "output_char_count",
  "page_end",
  "page_start",
  "prompt_version",
  "source_sha256",
  "status",
  "text_content",
  "trip_id",
  "updated_at",
  "upload_id",
  "usage",
].join(",");

function normalizeStatus(value: string): OcrBatchStatus {
  return value === "completed" || value === "failed" || value === "incomplete"
    ? value
    : "processing";
}

function normalizeOcrBatch(row: OcrBatchRow): OcrBatchCheckpoint {
  return {
    attemptCount: row.attempt_count ?? 0,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    id: row.id,
    incompleteReason: row.incomplete_reason,
    materialExtractionId: row.material_extraction_id,
    maxOutputTokens: row.max_output_tokens ?? 0,
    model: row.model,
    outputCharCount: row.output_char_count ?? 0,
    pageEnd: row.page_end,
    pageStart: row.page_start,
    promptVersion: row.prompt_version,
    sourceSha256: row.source_sha256,
    status: normalizeStatus(row.status),
    textContent: row.text_content,
    tripId: row.trip_id,
    updatedAt: row.updated_at,
    uploadId: row.upload_id,
    usage: row.usage ?? null,
  };
}

function missingOcrBatchTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function listReusableCompletedOcrBatches({
  materialExtractionId,
  promptVersion = OCR_PROMPT_VERSION,
  sourceSha256,
}: {
  materialExtractionId: string;
  promptVersion?: string;
  sourceSha256: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_material_ocr_batches")
    .select(ocrBatchColumns)
    .eq("material_extraction_id", materialExtractionId)
    .eq("source_sha256", sourceSha256)
    .eq("prompt_version", promptVersion)
    .eq("status", "completed")
    .order("page_start", { ascending: true });

  if (error) {
    if (missingOcrBatchTable(error)) {
      throw new Error(
        "OCR batch persistence is not installed. Apply the additive OCR/evidence foundations SQL before running extraction."
      );
    }

    throw new Error(`Unable to load reusable OCR batches: ${error.message}`);
  }

  return ((data ?? []) as unknown as OcrBatchRow[]).map(normalizeOcrBatch);
}

export async function listTripOcrBatchCheckpoints(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_material_ocr_batches")
    .select(ocrBatchColumns)
    .eq("trip_id", tripId)
    .order("page_start", { ascending: true });

  if (error) {
    if (missingOcrBatchTable(error)) {
      return [];
    }

    throw new Error(`Unable to load trip OCR batches: ${error.message}`);
  }

  return ((data ?? []) as unknown as OcrBatchRow[]).map(normalizeOcrBatch);
}

export async function saveOcrBatchCheckpoint({
  attemptCount,
  errorMessage = null,
  incompleteReason = null,
  materialExtractionId,
  maxOutputTokens,
  model = null,
  pageNumbers,
  promptVersion = OCR_PROMPT_VERSION,
  sourceSha256,
  status,
  textContent = null,
  tripId,
  uploadId,
  usage = null,
}: {
  attemptCount: number;
  errorMessage?: string | null;
  incompleteReason?: string | null;
  materialExtractionId: string;
  maxOutputTokens: number;
  model?: string | null;
  pageNumbers: number[];
  promptVersion?: string;
  sourceSha256: string;
  status: OcrBatchStatus;
  textContent?: string | null;
  tripId: string;
  uploadId: string;
  usage?: unknown;
}) {
  const pageStart = pageNumbers[0];
  const pageEnd = pageNumbers.at(-1);

  if (!pageStart || !pageEnd) {
    throw new Error("Cannot save an OCR batch without a page range.");
  }

  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("trip_material_ocr_batches")
    .upsert(
      {
        attempt_count: attemptCount,
        completed_at: status === "completed" ? now : null,
        error_message: errorMessage,
        incomplete_reason: incompleteReason,
        material_extraction_id: materialExtractionId,
        max_output_tokens: maxOutputTokens,
        model,
        output_char_count: textContent?.length ?? 0,
        page_end: pageEnd,
        page_start: pageStart,
        prompt_version: promptVersion,
        source_sha256: sourceSha256,
        status,
        text_content: textContent,
        trip_id: tripId,
        updated_at: now,
        upload_id: uploadId,
        usage,
      },
      {
        onConflict:
          "material_extraction_id,source_sha256,page_start,page_end,prompt_version",
      }
    )
    .select(ocrBatchColumns)
    .single();

  if (error || !data) {
    if (missingOcrBatchTable(error)) {
      throw new Error(
        "OCR batch persistence is not installed. Apply the additive OCR/evidence foundations SQL before running extraction."
      );
    }

    throw new Error(
      `Unable to save OCR batch checkpoint: ${error?.message ?? "No row"}`
    );
  }

  return normalizeOcrBatch(data as unknown as OcrBatchRow);
}
