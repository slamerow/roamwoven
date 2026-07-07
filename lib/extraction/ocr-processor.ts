import { getOpenAIConfig } from "@/lib/env";
import { createOpenAIOcrText, OpenAIExtractionRequestError } from "@/lib/ai/openai";
import {
  completeMaterialExtractionOcr,
  failMaterialExtractionOcr,
  listOcrNeededMaterialExtractions,
  markMaterialExtractionOcrProcessing,
  type MaterialExtractionRecord,
} from "@/lib/extraction/material-extractions";
import { downloadMaterialFile } from "@/lib/extraction/trip-materials";
import type { TripUpload } from "@/lib/uploads";

const OCR_PROVIDER = "openai-responses";
const MAX_OCR_FILE_BYTES = 10 * 1024 * 1024;

export type TripOcrProcessingSummary = {
  batches: number;
  completed: number;
  failed: number;
  skipped: number;
  attempted: number;
  usage: unknown[];
};

function getSupportedMimeType(upload: TripUpload) {
  if (
    upload.fileType === "application/pdf" ||
    upload.fileType === "image/jpeg" ||
    upload.fileType === "image/png" ||
    upload.fileType === "image/webp"
  ) {
    return upload.fileType;
  }

  return null;
}

function getUploadById(uploads: TripUpload[]) {
  return new Map(uploads.map((upload) => [upload.id, upload]));
}

function getFailureClass(error: unknown) {
  if (error instanceof OpenAIExtractionRequestError) {
    return error.status ? `openai_${error.status}` : "openai_ocr_failed";
  }

  return "ocr_failed";
}

function normalizeForComparison(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function requiresEmbeddedImageBackfill(record: MaterialExtractionRecord) {
  return (
    record.failureClass === "ocr_backfill_needed" &&
    Number(record.metadata.largeEmbeddedImageCount ?? 0) > 0
  );
}

function hasMeaningfulBackfillText({
  existingText,
  ocrText,
}: {
  existingText: string | null;
  ocrText: string;
}) {
  const existing = normalizeForComparison(existingText ?? "");
  const ocr = normalizeForComparison(ocrText);

  if (!existing) {
    return Boolean(ocr);
  }

  if (!ocr || existing === ocr || existing.includes(ocr)) {
    return false;
  }

  return true;
}

async function processOcrRecord({
  record,
  upload,
}: {
  record: MaterialExtractionRecord;
  upload: TripUpload;
}) {
  const mimeType = getSupportedMimeType(upload);

  if (!mimeType) {
    await failMaterialExtractionOcr({
      errorMessage: `OCR does not support ${upload.fileType ?? "unknown file type"} yet.`,
      failureClass: "unsupported_ocr_file_type",
      provider: OCR_PROVIDER,
      record,
    });
    return { status: "failed" as const, usage: null };
  }

  if (!upload.storagePath) {
    await failMaterialExtractionOcr({
      errorMessage: "OCR material has no stored file.",
      failureClass: "no_storage_path",
      provider: OCR_PROVIDER,
      record,
    });
    return { status: "failed" as const, usage: null };
  }

  if (Number(upload.fileSizeBytes ?? 0) > MAX_OCR_FILE_BYTES) {
    await failMaterialExtractionOcr({
      errorMessage: "OCR material is over the beta OCR size limit.",
      failureClass: "ocr_file_too_large",
      metadata: {
        fileSizeBytes: upload.fileSizeBytes,
        maxOcrFileBytes: MAX_OCR_FILE_BYTES,
      },
      provider: OCR_PROVIDER,
      record,
    });
    return { status: "failed" as const, usage: null };
  }

  const claimedRecord = await markMaterialExtractionOcrProcessing({
    id: record.id,
    metadata: {
      ...record.metadata,
      fileName: upload.originalFilename,
      fileSizeBytes: upload.fileSizeBytes,
      fileType: upload.fileType,
      ocrProvider: OCR_PROVIDER,
      startedAt: new Date().toISOString(),
    },
  });

  if (!claimedRecord) {
    return { status: "skipped" as const, usage: null };
  }

  try {
    const file = await downloadMaterialFile(upload);

    if (!file) {
      throw new Error("Unable to download material for OCR.");
    }

    const startedAt = Date.now();
    const result = await createOpenAIOcrText({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      filename: upload.originalFilename,
      mimeType,
    });
    const durationMs = Date.now() - startedAt;

    if (
      requiresEmbeddedImageBackfill(claimedRecord) &&
      !hasMeaningfulBackfillText({
        existingText: claimedRecord.textContent,
        ocrText: result.text,
      })
    ) {
      await failMaterialExtractionOcr({
        errorMessage:
          "OCR did not return new text beyond the PDF text layer for a PDF with embedded images.",
        failureClass: "ocr_no_embedded_image_text",
        metadata: {
          durationMs,
          fileName: upload.originalFilename,
          fileSizeBytes: upload.fileSizeBytes,
          fileType: upload.fileType,
          model: result.model,
          usage: result.usage,
        },
        provider: OCR_PROVIDER,
        record: claimedRecord,
      });

      return { status: "failed" as const, usage: null };
    }

    await completeMaterialExtractionOcr({
      metadata: {
        durationMs,
        fileName: upload.originalFilename,
        fileSizeBytes: upload.fileSizeBytes,
        fileType: upload.fileType,
        model: result.model,
        usage: result.usage,
      },
      provider: OCR_PROVIDER,
      record: claimedRecord,
      text: result.text,
    });

    return {
      status: "completed" as const,
      usage: {
        durationMs,
        model: result.model,
        uploadId: upload.id,
        usage: result.usage,
      },
    };
  } catch (error) {
    await failMaterialExtractionOcr({
      errorMessage: error instanceof Error ? error.message : "Unknown OCR error.",
      failureClass: getFailureClass(error),
      metadata: {
        fileName: upload.originalFilename,
        fileSizeBytes: upload.fileSizeBytes,
        fileType: upload.fileType,
      },
      provider: OCR_PROVIDER,
      record: claimedRecord,
    });

    return { status: "failed" as const, usage: null };
  }
}

export async function processTripOcrNeededMaterials({
  tripId,
  uploads,
}: {
  tripId: string;
  uploads: TripUpload[];
}): Promise<TripOcrProcessingSummary> {
  const config = getOpenAIConfig();
  const uploadsById = getUploadById(uploads);
  const summary: TripOcrProcessingSummary = {
    attempted: 0,
    batches: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    usage: [],
  };
  const seenRecordIds = new Set<string>();

  while (true) {
    const records = await listOcrNeededMaterialExtractions({
      limit: config.ocrMaxFilesPerRun,
      tripId,
    });
    const unprocessedRecords = records.filter(
      (record) => !seenRecordIds.has(record.id)
    );

    if (unprocessedRecords.length === 0) {
      break;
    }

    summary.batches += 1;

    for (const record of unprocessedRecords) {
      seenRecordIds.add(record.id);
      const upload = uploadsById.get(record.uploadId);

      if (!upload) {
        await failMaterialExtractionOcr({
          errorMessage: "Source upload is missing for OCR material.",
          failureClass: "missing_upload",
          provider: OCR_PROVIDER,
          record,
        });
        summary.failed += 1;
        continue;
      }

      summary.attempted += 1;
      const result = await processOcrRecord({ record, upload });

      if (result.status === "completed") {
        summary.completed += 1;
      } else if (result.status === "failed") {
        summary.failed += 1;
      } else {
        summary.skipped += 1;
      }

      if (result.usage) {
        summary.usage.push(result.usage);
      }
    }
  }

  return summary;
}
