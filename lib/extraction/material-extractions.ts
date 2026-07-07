import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";

const MAX_STORED_TEXT_CONTENT_CHARS = 80000;

export type MaterialExtractionStatus =
  | "failed"
  | "ocr_needed"
  | "ocr_processing"
  | "pending"
  | "text_ready"
  | "unsupported";

export type MaterialExtractionMethod =
  | "manual_note"
  | "ocr"
  | "pdf_text"
  | "text_file"
  | "triage";

export type MaterialExtractionRecord = {
  id: string;
  completedAt: string | null;
  createdAt: string | null;
  errorMessage: string | null;
  extractedCharCount: number;
  extractionMethod: string | null;
  failureClass: string | null;
  metadata: Record<string, unknown>;
  status: MaterialExtractionStatus;
  textContent: string | null;
  tripId: string;
  updatedAt: string | null;
  uploadId: string;
};

export type MaterialExtractionCheckpointInput = {
  errorMessage?: string | null;
  extractedCharCount?: number;
  extractionMethod?: MaterialExtractionMethod;
  failureClass?: string | null;
  metadata?: Record<string, unknown>;
  status: MaterialExtractionStatus;
  textContent?: string | null;
  tripId: string;
  uploadId: string;
};

export type MaterialOcrReadinessIssue = "ocr-failed" | "ocr-incomplete" | null;

type MaterialExtractionRow = {
  id: string;
  completed_at: string | null;
  created_at: string | null;
  error_message: string | null;
  extracted_char_count: number | null;
  extraction_method: string | null;
  failure_class: string | null;
  metadata: unknown;
  status: string | null;
  text_content: string | null;
  trip_id: string;
  updated_at: string | null;
  upload_id: string;
};

const materialExtractionColumns = [
  "id",
  "completed_at",
  "created_at",
  "error_message",
  "extracted_char_count",
  "extraction_method",
  "failure_class",
  "metadata",
  "status",
  "text_content",
  "trip_id",
  "updated_at",
  "upload_id",
].join(",");

function normalizeStatus(value: string | null): MaterialExtractionStatus {
  if (
    value === "failed" ||
    value === "ocr_needed" ||
    value === "ocr_processing" ||
    value === "pending" ||
    value === "text_ready" ||
    value === "unsupported"
  ) {
    return value;
  }

  return "pending";
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeMaterialExtraction(
  row: MaterialExtractionRow
): MaterialExtractionRecord {
  return {
    id: row.id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    errorMessage: row.error_message,
    extractedCharCount: row.extracted_char_count ?? 0,
    extractionMethod: row.extraction_method,
    failureClass: row.failure_class,
    metadata: normalizeMetadata(row.metadata),
    status: normalizeStatus(row.status),
    textContent: row.text_content,
    tripId: row.trip_id,
    updatedAt: row.updated_at,
    uploadId: row.upload_id,
  };
}

function shouldMarkComplete(status: MaterialExtractionStatus) {
  return status !== "pending";
}

function trimStoredTextContent(value: string | null) {
  if (!value || value.length <= MAX_STORED_TEXT_CONTENT_CHARS) {
    return {
      text: value,
      truncated: false,
    };
  }

  const headLength = Math.floor(MAX_STORED_TEXT_CONTENT_CHARS * 0.82);
  const tailLength = MAX_STORED_TEXT_CONTENT_CHARS - headLength - 140;
  const text = [
    value.slice(0, headLength).trim(),
    "[Roamwoven trimmed extracted material text here to keep checkpoint storage bounded.]",
    value.slice(Math.max(0, value.length - tailLength)).trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    text,
    truncated: true,
  };
}

function combineExtractedText({
  existingText,
  ocrText,
}: {
  existingText: string | null;
  ocrText: string;
}) {
  const existing = existingText?.trim() ?? "";
  const ocr = ocrText.trim();

  if (!existing) {
    return ocr;
  }

  if (!ocr) {
    return existing;
  }

  if (existing.includes(ocr)) {
    return existing;
  }

  if (ocr.includes(existing)) {
    return ocr;
  }

  return [
    "[PDF text layer]",
    existing,
    "[OCR text from embedded images]",
    ocr,
  ].join("\n\n");
}

function isOcrRelatedFailure(record: MaterialExtractionRecord) {
  if (record.status !== "failed") {
    return false;
  }

  return Boolean(
    record.extractionMethod === "ocr" ||
      record.metadata.ocrProvider ||
      record.metadata.ocrBackfillRequested ||
      record.metadata.ocrFailedTextFallbackAvailable ||
      record.failureClass?.includes("ocr") ||
      record.failureClass?.startsWith("openai_")
  );
}

export function getMaterialOcrReadinessIssue(
  records: MaterialExtractionRecord[]
): MaterialOcrReadinessIssue {
  if (
    records.some(
      (record) =>
        record.status === "ocr_needed" || record.status === "ocr_processing"
    )
  ) {
    return "ocr-incomplete";
  }

  return records.some(isOcrRelatedFailure) ? "ocr-failed" : null;
}

export async function upsertMaterialExtractionCheckpoint(
  input: MaterialExtractionCheckpointInput
) {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const completedAt = shouldMarkComplete(input.status) ? now : null;
  const rawTextContent = input.textContent?.trim() || null;
  const storedTextContent = trimStoredTextContent(rawTextContent);
  const textContent = storedTextContent.text;
  const extractedCharCount =
    input.extractedCharCount ?? (rawTextContent ? rawTextContent.length : 0);
  const metadata = {
    ...(input.metadata ?? {}),
    ...(storedTextContent.truncated
      ? {
          storedTextContentCharCount: textContent?.length ?? 0,
          storedTextContentTruncated: true,
        }
      : {}),
  };

  const { data, error } = await supabase
    .from("trip_material_extractions")
    .upsert(
      {
        completed_at: completedAt,
        error_message: input.errorMessage?.slice(0, 1000) ?? null,
        extracted_char_count: extractedCharCount,
        extraction_method: input.extractionMethod ?? "triage",
        failure_class: input.failureClass ?? null,
        metadata,
        status: input.status,
        text_content: textContent,
        trip_id: input.tripId,
        updated_at: now,
        upload_id: input.uploadId,
      },
      { onConflict: "upload_id" }
    )
    .select(materialExtractionColumns)
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to save material extraction checkpoint: ${
        error?.message ?? "No row"
      }`
    );
  }

  return normalizeMaterialExtraction(data as unknown as MaterialExtractionRow);
}

export async function listMaterialExtractionCheckpoints(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_material_extractions")
    .select(materialExtractionColumns)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return [];
    }

    throw new Error(`Unable to load material extractions: ${error.message}`);
  }

  return ((data ?? []) as unknown as MaterialExtractionRow[]).map(
    normalizeMaterialExtraction
  );
}

export async function listOcrNeededMaterialExtractions({
  limit = 20,
  tripId,
}: {
  limit?: number;
  tripId?: string;
} = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("trip_material_extractions")
    .select(materialExtractionColumns)
    .eq("status", "ocr_needed")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (tripId) {
    query = query.eq("trip_id", tripId);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return [];
    }

    throw new Error(`Unable to load OCR-needed materials: ${error.message}`);
  }

  return ((data ?? []) as unknown as MaterialExtractionRow[]).map(
    normalizeMaterialExtraction
  );
}

export async function markMaterialExtractionOcrProcessing({
  id,
  metadata = {},
}: {
  id: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("trip_material_extractions")
    .update({
      completed_at: null,
      error_message: null,
      extraction_method: "ocr",
      failure_class: null,
      metadata,
      status: "ocr_processing",
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "ocr_needed")
    .select(materialExtractionColumns)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to mark material OCR processing: ${error.message}`);
  }

  return data ? normalizeMaterialExtraction(data as unknown as MaterialExtractionRow) : null;
}

export async function completeMaterialExtractionOcr({
  metadata = {},
  provider,
  record,
  text,
}: {
  metadata?: Record<string, unknown>;
  provider: string;
  record: MaterialExtractionRecord;
  text: string;
}) {
  const combinedText = combineExtractedText({
    existingText: record.textContent,
    ocrText: text,
  });

  return upsertMaterialExtractionCheckpoint({
    extractedCharCount: combinedText.trim().length,
    extractionMethod: "ocr",
    metadata: {
      ...record.metadata,
      ...metadata,
      ...(record.textContent?.trim()
        ? {
            ocrBackfilledPdfText: true,
            originalPdfTextCharCount: record.textContent.trim().length,
          }
        : {}),
      ocrProvider: provider,
    },
    status: "text_ready",
    textContent: combinedText,
    tripId: record.tripId,
    uploadId: record.uploadId,
  });
}

export async function failMaterialExtractionOcr({
  errorMessage,
  failureClass = "ocr_failed",
  metadata = {},
  provider,
  record,
}: {
  errorMessage: string;
  failureClass?: string;
  metadata?: Record<string, unknown>;
  provider: string;
  record: MaterialExtractionRecord;
}) {
  if (record.textContent?.trim()) {
    return upsertMaterialExtractionCheckpoint({
      errorMessage,
      extractedCharCount: record.textContent.trim().length,
      extractionMethod: "ocr",
      failureClass,
      metadata: {
        ...record.metadata,
        ...metadata,
        ocrErrorMessage: errorMessage,
        ocrFailedTextFallbackAvailable: true,
        ocrProvider: provider,
      },
      status: "failed",
      textContent: record.textContent,
      tripId: record.tripId,
      uploadId: record.uploadId,
    });
  }

  return upsertMaterialExtractionCheckpoint({
    errorMessage,
    extractionMethod: "ocr",
    failureClass,
    metadata: {
      ...record.metadata,
      ...metadata,
      ocrProvider: provider,
    },
    status: "failed",
    tripId: record.tripId,
    uploadId: record.uploadId,
  });
}

export function materialFromCheckpoint({
  filename,
  record,
  type,
}: {
  filename: string;
  record: MaterialExtractionRecord;
  type: TripExtractionMaterial["type"];
}): TripExtractionMaterial | null {
  const canUseText =
    record.status === "text_ready" ||
    (record.status === "ocr_needed" &&
      record.failureClass === "ocr_backfill_needed");

  if (!canUseText || !record.textContent?.trim()) {
    return null;
  }

  return {
    filename,
    sourceUploadId: record.uploadId,
    text: record.textContent.trim(),
    type,
  };
}
