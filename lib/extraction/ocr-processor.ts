import { getOpenAIConfig } from "@/lib/env";
import { createOpenAIOcrText, OpenAIExtractionRequestError } from "@/lib/ai/openai";
import {
  listReusableCompletedOcrBatches,
  saveOcrBatchCheckpoint,
  type OcrBatchCheckpoint,
} from "@/lib/extraction/ocr-batches";
import {
  completeMaterialExtractionOcr,
  failMaterialExtractionOcr,
  listOcrNeededMaterialExtractions,
  markMaterialExtractionOcrProcessing,
  requeueStaleOcrProcessingCheckpoints,
  type MaterialExtractionRecord,
} from "@/lib/extraction/material-extractions";
import { downloadMaterialFile } from "@/lib/extraction/trip-materials";
import {
  createPageNumberBatches,
  createPdfPageBatcher,
  type PdfPageBatcher,
} from "@/lib/extraction/pdf-page-batches";
import { extractSourceTransportAnchorsFromMaterials } from "@/lib/extraction/source-transport-anchors";
import type { TripUpload } from "@/lib/uploads";

const OCR_PROVIDER = "openai-responses";
const MAX_OCR_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_OCR_PDF_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_SINGLE_PAGE_INCOMPLETE_ATTEMPTS = 2;
const OCR_PAGE_BATCH_CONCURRENCY = 3;
const MAX_TRANSPORT_VERIFICATION_PAGES = 4;
const TRANSPORT_VERIFICATION_CONCURRENCY = 2;

export type TripOcrProcessingSummary = {
  batches: number;
  completed: number;
  failed: number;
  skipped: number;
  attempted: number;
  pageBatches: number;
  pagesCompleted: number;
  retriedPageBatches: number;
  reusedPageBatches: number;
  staleMaterialsRequeued: number;
  usage: unknown[];
};

type CompletedOcrBatch = {
  model: string;
  pageNumbers: number[];
  reused: boolean;
  text: string;
  usage: unknown;
};

type PdfOcrResult = {
  batches: CompletedOcrBatch[];
  pageCount: number;
  retries: number;
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
    const failureClass = asRecord(error.details)?.failureClass;

    if (typeof failureClass === "string" && failureClass.startsWith("ocr_")) {
      return failureClass;
    }

    return error.status ? `openai_${error.status}` : "openai_ocr_failed";
  }

  return "ocr_failed";
}

function normalizeForComparison(value: string) {
  return value
    .replace(/===\s*page\s+\d+\s*===/gi, " ")
    .replace(/\[(?:no readable text|illegible)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getIncompleteReason(error: unknown) {
  if (!(error instanceof OpenAIExtractionRequestError)) {
    return null;
  }

  const details = asRecord(error.details);
  const failureClass = details?.failureClass;

  if (
    failureClass !== "ocr_incomplete_response" &&
    failureClass !== "ocr_page_coverage_incomplete"
  ) {
    return null;
  }

  return typeof details?.incompleteReason === "string"
    ? details.incompleteReason
    : String(failureClass);
}

export function getMissingOcrPageNumbers(text: string, pageNumbers: number[]) {
  const reportedPages = new Set(
    [...text.matchAll(/===\s*page\s+(\d+)\s*===/gi)]
      .map((match) => Number(match[1]))
      .filter(Number.isInteger)
  );

  return pageNumbers.filter((pageNumber) => !reportedPages.has(pageNumber));
}

function getOcrPageText(text: string, pageNumber: number) {
  const header = new RegExp(
    `===\\s*page\\s+${pageNumber}\\s*===([\\s\\S]*?)(?====\\s*page\\s+\\d+\\s*===|$)`,
    "i"
  );
  return header.exec(text)?.[1]?.trim() ?? "";
}

export function findTransportOcrVerificationPages(
  text: string,
  pageNumbers: number[]
) {
  return pageNumbers.filter((pageNumber) => {
    const pageText = getOcrPageText(text, pageNumber);
    if (!/\b(?:flight|train|bus|ferry|transfer)\b/i.test(pageText)) {
      return false;
    }

    const anchors = extractSourceTransportAnchorsFromMaterials([{
      filename: `OCR page ${pageNumber}`,
      sourceProvenance: "ocr",
      text: pageText,
      type: "pdf_text",
    }]);
    const critical = anchors.filter(
      (anchor) => anchor.kind === "flight" || anchor.kind === "train"
    );

    if (critical.length === 0) {
      return /\b\d{1,2}:\d{2}\b|\b(?:booking|confirmation|flight|train)\s+(?:code|number|#)/i.test(
        pageText
      );
    }

    return critical.some(
      (anchor) =>
        !anchor.departureLocation ||
        !anchor.arrivalLocation ||
        !anchor.departureTime ||
        (anchor.kind === "train" && !anchor.arrivalTime)
    );
  });
}

function batchKey(pageNumbers: number[]) {
  return `${pageNumbers[0]}-${pageNumbers.at(-1)}`;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    })
  );

  return results;
}

function pageNumbersForCheckpoint(checkpoint: OcrBatchCheckpoint) {
  return Array.from(
    { length: checkpoint.pageEnd - checkpoint.pageStart + 1 },
    (_, index) => checkpoint.pageStart + index
  );
}

function findReusableCoverage({
  pageNumbers,
  reusable,
}: {
  pageNumbers: number[];
  reusable: Map<string, OcrBatchCheckpoint>;
}) {
  const covered: OcrBatchCheckpoint[] = [];
  let currentPage = pageNumbers[0];
  const finalPage = pageNumbers.at(-1);

  if (!currentPage || !finalPage) {
    return null;
  }

  while (currentPage <= finalPage) {
    const candidate = [...reusable.values()]
      .filter(
        (batch) =>
          batch.pageStart === currentPage &&
          batch.pageEnd <= finalPage &&
          Boolean(batch.textContent?.trim())
      )
      .sort((left, right) => right.pageEnd - left.pageEnd)[0];

    if (!candidate) {
      return null;
    }

    covered.push(candidate);
    currentPage = candidate.pageEnd + 1;
  }

  return covered;
}

async function processPdfOcr({
  batcher,
  config,
  record,
  sourceSha256,
  upload,
}: {
  batcher: PdfPageBatcher;
  config: ReturnType<typeof getOpenAIConfig>;
  record: MaterialExtractionRecord;
  sourceSha256: string;
  upload: TripUpload;
}): Promise<PdfOcrResult> {
  const reusableRows = await listReusableCompletedOcrBatches({
    materialExtractionId: record.id,
    sourceSha256,
  });
  const reusable = new Map(
    reusableRows.map((batch) => [
      `${batch.pageStart}-${batch.pageEnd}`,
      batch,
    ])
  );
  let retries = 0;
  const transportVerificationPages = new Set<number>();

  const processBatch = async (
    pageNumbers: number[],
    attempt = 1
  ): Promise<CompletedOcrBatch[]> => {
    const reusableCoverage = findReusableCoverage({ pageNumbers, reusable });

    if (reusableCoverage) {
      return reusableCoverage.map((batch) => ({
        model: batch.model ?? config.ocrModel,
        pageNumbers: pageNumbersForCheckpoint(batch),
        reused: true,
        text: batch.textContent ?? "",
        usage: batch.usage,
      }));
    }

    const maxOutputTokens =
      pageNumbers.length === 1 && attempt > 1
        ? Math.max(config.ocrMaxOutputTokens * 2, 20000)
        : config.ocrMaxOutputTokens;
    await saveOcrBatchCheckpoint({
      attemptCount: attempt,
      materialExtractionId: record.id,
      maxOutputTokens,
      model: config.ocrModel,
      pageNumbers,
      sourceSha256,
      status: "processing",
      tripId: record.tripId,
      uploadId: upload.id,
    });

    try {
      const batch = await batcher.createBatch(pageNumbers);
      const result = await createOpenAIOcrText(
        {
          base64: batch.base64,
          filename: `${upload.originalFilename} pages ${pageNumbers[0]}-${pageNumbers.at(-1)}`,
          mimeType: "application/pdf",
        },
        {
          maxOutputTokens,
          originalPageNumbers: pageNumbers,
        }
      );
      const missingPages = getMissingOcrPageNumbers(result.text, pageNumbers);

      if (missingPages.length > 0) {
        throw new OpenAIExtractionRequestError(
          `OCR page coverage was incomplete for pages ${missingPages.join(", ")}.`,
          null,
          {
            failureClass: "ocr_page_coverage_incomplete",
            incompleteReason: "missing_page_markers",
            missingPages,
          }
        );
      }

      const verificationPages = findTransportOcrVerificationPages(
        result.text,
        pageNumbers
      )
        .filter((pageNumber) => !transportVerificationPages.has(pageNumber))
        .slice(
          0,
          Math.max(
            0,
            MAX_TRANSPORT_VERIFICATION_PAGES - transportVerificationPages.size
          )
        );
      const verificationResults = await mapWithConcurrency(
        verificationPages,
        TRANSPORT_VERIFICATION_CONCURRENCY,
        async (pageNumber) => {
          transportVerificationPages.add(pageNumber);

          try {
            const focusedBatch = await batcher.createBatch([pageNumber]);
            const focused = await createOpenAIOcrText(
              {
                base64: focusedBatch.base64,
                filename: `${upload.originalFilename} page ${pageNumber} transport verification`,
                mimeType: "application/pdf",
              },
              {
                focus: "transport",
                maxOutputTokens: Math.max(4000, Math.min(maxOutputTokens, 8000)),
                originalPageNumbers: [pageNumber],
              }
            );

            if (getMissingOcrPageNumbers(focused.text, [pageNumber]).length > 0) {
              return null;
            }

            return focused;
          } catch (error) {
            console.warn("trip_transport_ocr_verification_failed", {
              message: error instanceof Error ? error.message : "Unknown error.",
              pageNumber,
              tripId: record.tripId,
              uploadId: upload.id,
            });
            return null;
          }
        }
      );
      const completedVerification = verificationResults.filter(
        (candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)
      );
      const completedText = [
        result.text,
        ...completedVerification.map((candidate) => candidate.text),
      ].join("\n\n");
      const completedUsage = completedVerification.length > 0
        ? {
            primary: result.usage,
            transportVerification: completedVerification.map((candidate) => ({
              pageNumbers: candidate.pageNumbers,
              usage: candidate.usage,
            })),
          }
        : result.usage;

      const saved = await saveOcrBatchCheckpoint({
        attemptCount: attempt,
        materialExtractionId: record.id,
        maxOutputTokens,
        model: result.model,
        pageNumbers,
        sourceSha256,
        status: "completed",
        textContent: completedText,
        tripId: record.tripId,
        uploadId: upload.id,
        usage: completedUsage,
      });
      reusable.set(batchKey(pageNumbers), saved);

      return [
        {
          model: result.model,
          pageNumbers,
          reused: false,
          text: completedText,
          usage: completedUsage,
        },
      ];
    } catch (error) {
      const incompleteReason = getIncompleteReason(error);
      await saveOcrBatchCheckpoint({
        attemptCount: attempt,
        errorMessage: error instanceof Error ? error.message : "Unknown OCR error.",
        incompleteReason,
        materialExtractionId: record.id,
        maxOutputTokens,
        model: config.ocrModel,
        pageNumbers,
        sourceSha256,
        status: incompleteReason ? "incomplete" : "failed",
        tripId: record.tripId,
        uploadId: upload.id,
      });

      if (!incompleteReason) {
        throw error;
      }

      retries += 1;

      if (pageNumbers.length > 1) {
        const midpoint = Math.ceil(pageNumbers.length / 2);
        const left = pageNumbers.slice(0, midpoint);
        const right = pageNumbers.slice(midpoint);
        const [leftResults, rightResults] = await Promise.all([
          processBatch(left),
          processBatch(right),
        ]);

        return [...leftResults, ...rightResults];
      }

      if (attempt < MAX_SINGLE_PAGE_INCOMPLETE_ATTEMPTS) {
        return processBatch(pageNumbers, attempt + 1);
      }

      throw error;
    }
  };

  const plannedBatches = createPageNumberBatches({
    batchSize: config.ocrPdfBatchPages,
    pageCount: batcher.pageCount,
  });
  const completed = (
    await mapWithConcurrency(
      plannedBatches,
      OCR_PAGE_BATCH_CONCURRENCY,
      (pageNumbers) => processBatch(pageNumbers)
    )
  )
    .flat()
    .sort((left, right) => left.pageNumbers[0] - right.pageNumbers[0]);

  return {
    batches: completed,
    pageCount: batcher.pageCount,
    retries,
  };
}

async function processSingleImageOcr({
  base64,
  config,
  filename,
  mimeType,
}: {
  base64: string;
  config: ReturnType<typeof getOpenAIConfig>;
  filename: string;
  mimeType: string;
}) {
  try {
    return await createOpenAIOcrText({ base64, filename, mimeType });
  } catch (error) {
    if (!getIncompleteReason(error)) {
      throw error;
    }

    return createOpenAIOcrText(
      { base64, filename, mimeType },
      { maxOutputTokens: Math.max(config.ocrMaxOutputTokens * 2, 20000) }
    );
  }
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

  const maxSourceBytes =
    mimeType === "application/pdf"
      ? MAX_OCR_PDF_SOURCE_BYTES
      : MAX_OCR_IMAGE_BYTES;

  if (Number(upload.fileSizeBytes ?? 0) > maxSourceBytes) {
    await failMaterialExtractionOcr({
      errorMessage: "OCR material is over the beta OCR size limit.",
      failureClass: "ocr_file_too_large",
      metadata: {
        fileSizeBytes: upload.fileSizeBytes,
        maxOcrFileBytes: maxSourceBytes,
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const config = getOpenAIConfig();
    const sourceSha256 = upload.contentSha256 ?? `${upload.id}:${bytes.length}`;
    const pdfResult =
      mimeType === "application/pdf"
        ? await processPdfOcr({
            batcher: await createPdfPageBatcher(bytes),
            config,
            record: claimedRecord,
            sourceSha256,
            upload,
          })
        : null;
    const imageResult = pdfResult
      ? null
      : await processSingleImageOcr({
          base64: Buffer.from(bytes).toString("base64"),
          config,
          filename: upload.originalFilename,
          mimeType,
        });
    const ocrText = pdfResult
      ? pdfResult.batches.map((batch) => batch.text).join("\n\n")
      : imageResult?.text ?? "";
    const model =
      pdfResult?.batches.at(-1)?.model ?? imageResult?.model ?? config.ocrModel;
    const usage = pdfResult
      ? pdfResult.batches.map((batch) => batch.usage)
      : imageResult?.usage ?? null;
    const durationMs = Date.now() - startedAt;

    if (
      requiresEmbeddedImageBackfill(claimedRecord) &&
      !hasMeaningfulBackfillText({
        existingText: claimedRecord.textContent,
        ocrText,
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
          model,
          pageBatchCount: pdfResult?.batches.length ?? 0,
          pageCount: pdfResult?.pageCount ?? null,
          retriedPageBatchCount: pdfResult?.retries ?? 0,
          usage,
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
        model,
        pageBatchCount: pdfResult?.batches.length ?? 0,
        pageCount: pdfResult?.pageCount ?? null,
        retriedPageBatchCount: pdfResult?.retries ?? 0,
        reusedPageBatchCount:
          pdfResult?.batches.filter((batch) => batch.reused).length ?? 0,
        usage,
      },
      provider: OCR_PROVIDER,
      record: claimedRecord,
      text: ocrText,
    });

    return {
      status: "completed" as const,
      usage: {
        durationMs,
        model,
        pageBatches: pdfResult?.batches.length ?? 0,
        pagesCompleted: pdfResult?.pageCount ?? 0,
        retriedPageBatches: pdfResult?.retries ?? 0,
        reusedPageBatches:
          pdfResult?.batches.filter((batch) => batch.reused).length ?? 0,
        uploadId: upload.id,
        usage,
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
    pageBatches: 0,
    pagesCompleted: 0,
    retriedPageBatches: 0,
    reusedPageBatches: 0,
    staleMaterialsRequeued: 0,
    usage: [],
  };
  const seenRecordIds = new Set<string>();

  summary.staleMaterialsRequeued =
    await requeueStaleOcrProcessingCheckpoints({ tripId });

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
        const usage = result.usage as {
          pageBatches?: number;
          pagesCompleted?: number;
          retriedPageBatches?: number;
          reusedPageBatches?: number;
        };
        summary.pageBatches += usage.pageBatches ?? 0;
        summary.pagesCompleted += usage.pagesCompleted ?? 0;
        summary.retriedPageBatches += usage.retriedPageBatches ?? 0;
        summary.reusedPageBatches += usage.reusedPageBatches ?? 0;
      }
    }
  }

  return summary;
}
