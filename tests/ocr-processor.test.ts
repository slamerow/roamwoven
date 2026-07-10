import assert from "node:assert/strict";
import type { MaterialExtractionRecord } from "@/lib/extraction/material-extractions";
import type { TripUpload } from "@/lib/uploads";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function checkpoint(index: number): MaterialExtractionRecord {
  return {
    id: `checkpoint-${index}`,
    completedAt: null,
    createdAt: `2026-06-19T12:00:0${index}.000Z`,
    errorMessage: null,
    extractedCharCount: 0,
    extractionMethod: "triage",
    failureClass: "pdf_text_too_sparse",
    metadata: {},
    status: "ocr_needed",
    textContent: null,
    tripId: "trip-ocr-batches",
    updatedAt: `2026-06-19T12:00:0${index}.000Z`,
    uploadId: `upload-${index}`,
  };
}

function upload(index: number): TripUpload {
  return {
    contentSha256: `hash-${index}`,
    createdAt: `2026-06-19T12:00:0${index}.000Z`,
    fileSizeBytes: 100,
    fileType: "image/png",
    id: `upload-${index}`,
    originalFilename: `ticket-${index}.png`,
    processingStatus: "uploaded",
    sourceKind: "file",
    storagePath: `trip-ocr-batches/ticket-${index}.png`,
    tripId: "trip-ocr-batches",
    userNote: null,
  };
}

export default async function run() {
  await test("OCR processes every pending material across batches", async () => {
    const originalBatchSize = process.env.OPENAI_OCR_MAX_FILES_PER_RUN;
    const materialExtractions = require("@/lib/extraction/material-extractions");
    const tripMaterials = require("@/lib/extraction/trip-materials");
    const openai = require("@/lib/ai/openai");
    const originals = {
      completeMaterialExtractionOcr:
        materialExtractions.completeMaterialExtractionOcr,
      createOpenAIOcrText: openai.createOpenAIOcrText,
      downloadMaterialFile: tripMaterials.downloadMaterialFile,
      failMaterialExtractionOcr: materialExtractions.failMaterialExtractionOcr,
      listOcrNeededMaterialExtractions:
        materialExtractions.listOcrNeededMaterialExtractions,
      markMaterialExtractionOcrProcessing:
        materialExtractions.markMaterialExtractionOcrProcessing,
      requeueStaleOcrProcessingCheckpoints:
        materialExtractions.requeueStaleOcrProcessingCheckpoints,
    };
    const pending = [1, 2, 3, 4, 5].map(checkpoint);
    const completed: string[] = [];

    process.env.OPENAI_OCR_MAX_FILES_PER_RUN = "2";
    materialExtractions.listOcrNeededMaterialExtractions = async ({
      limit,
    }: {
      limit: number;
    }) => pending.filter((record) => record.status === "ocr_needed").slice(0, limit);
    materialExtractions.markMaterialExtractionOcrProcessing = async ({
      id,
    }: {
      id: string;
    }) => {
      const record = pending.find((candidate) => candidate.id === id);

      if (!record || record.status !== "ocr_needed") {
        return null;
      }

      record.status = "ocr_processing";
      return record;
    };
    materialExtractions.requeueStaleOcrProcessingCheckpoints = async () => 0;
    materialExtractions.completeMaterialExtractionOcr = async ({
      record,
    }: {
      record: MaterialExtractionRecord;
    }) => {
      record.status = "text_ready";
      completed.push(record.id);
      return record;
    };
    materialExtractions.failMaterialExtractionOcr = async ({
      record,
    }: {
      record: MaterialExtractionRecord;
    }) => {
      record.status = "failed";
      return record;
    };
    tripMaterials.downloadMaterialFile = async () => new Blob(["fake"]);
    openai.createOpenAIOcrText = async () => ({
      model: "test-ocr",
      text: "OCR text",
      usage: null,
    });

    try {
      const { processTripOcrNeededMaterials } = require("@/lib/extraction/ocr-processor");
      const summary = await processTripOcrNeededMaterials({
        tripId: "trip-ocr-batches",
        uploads: [1, 2, 3, 4, 5].map(upload),
      });

      assert.equal(summary.attempted, 5);
      assert.equal(summary.batches, 3);
      assert.equal(summary.completed, 5);
      assert.deepEqual(completed, [
        "checkpoint-1",
        "checkpoint-2",
        "checkpoint-3",
        "checkpoint-4",
        "checkpoint-5",
      ]);
    } finally {
      process.env.OPENAI_OCR_MAX_FILES_PER_RUN = originalBatchSize;
      materialExtractions.completeMaterialExtractionOcr =
        originals.completeMaterialExtractionOcr;
      materialExtractions.failMaterialExtractionOcr =
        originals.failMaterialExtractionOcr;
      materialExtractions.listOcrNeededMaterialExtractions =
        originals.listOcrNeededMaterialExtractions;
      materialExtractions.markMaterialExtractionOcrProcessing =
        originals.markMaterialExtractionOcrProcessing;
      materialExtractions.requeueStaleOcrProcessingCheckpoints =
        originals.requeueStaleOcrProcessingCheckpoints;
      tripMaterials.downloadMaterialFile = originals.downloadMaterialFile;
      openai.createOpenAIOcrText = originals.createOpenAIOcrText;
    }
  });

  await test("incomplete PDF OCR splits into complete page batches before text-ready", async () => {
    const materialExtractions = require("@/lib/extraction/material-extractions");
    const tripMaterials = require("@/lib/extraction/trip-materials");
    const openai = require("@/lib/ai/openai");
    const ocrBatches = require("@/lib/extraction/ocr-batches");
    const pdfPageBatches = require("@/lib/extraction/pdf-page-batches");
    const originals = {
      completeMaterialExtractionOcr:
        materialExtractions.completeMaterialExtractionOcr,
      createOpenAIOcrText: openai.createOpenAIOcrText,
      createPdfPageBatcher: pdfPageBatches.createPdfPageBatcher,
      downloadMaterialFile: tripMaterials.downloadMaterialFile,
      failMaterialExtractionOcr: materialExtractions.failMaterialExtractionOcr,
      listOcrNeededMaterialExtractions:
        materialExtractions.listOcrNeededMaterialExtractions,
      listReusableCompletedOcrBatches:
        ocrBatches.listReusableCompletedOcrBatches,
      markMaterialExtractionOcrProcessing:
        materialExtractions.markMaterialExtractionOcrProcessing,
      requeueStaleOcrProcessingCheckpoints:
        materialExtractions.requeueStaleOcrProcessingCheckpoints,
      saveOcrBatchCheckpoint: ocrBatches.saveOcrBatchCheckpoint,
    };
    const record = checkpoint(9);
    const pdfUpload: TripUpload = {
      ...upload(9),
      fileType: "application/pdf",
      originalFilename: "visual-itinerary.pdf",
      storagePath: "trip-ocr-batches/visual-itinerary.pdf",
    };
    const savedStatuses: string[] = [];
    let completedText = "";

    materialExtractions.listOcrNeededMaterialExtractions = async () =>
      record.status === "ocr_needed" ? [record] : [];
    materialExtractions.markMaterialExtractionOcrProcessing = async () => {
      record.status = "ocr_processing";
      return record;
    };
    materialExtractions.requeueStaleOcrProcessingCheckpoints = async () => 0;
    materialExtractions.completeMaterialExtractionOcr = async ({
      text,
    }: {
      text: string;
    }) => {
      completedText = text;
      record.status = "text_ready";
      return record;
    };
    materialExtractions.failMaterialExtractionOcr = async () => {
      record.status = "failed";
      return record;
    };
    tripMaterials.downloadMaterialFile = async () => new Blob(["fake pdf"]);
    pdfPageBatches.createPdfPageBatcher = async () => ({
      createBatch: async (pageNumbers: number[]) => ({
        base64: Buffer.from(pageNumbers.join(",")).toString("base64"),
        pageNumbers,
      }),
      pageCount: 4,
    });
    ocrBatches.listReusableCompletedOcrBatches = async () => [];
    ocrBatches.saveOcrBatchCheckpoint = async (input: {
      attemptCount: number;
      model?: string | null;
      pageNumbers: number[];
      status: string;
      textContent?: string | null;
    }) => {
      savedStatuses.push(
        `${input.pageNumbers.join("-")}:${input.status}`
      );
      return {
        attemptCount: input.attemptCount,
        completedAt: input.status === "completed" ? new Date().toISOString() : null,
        errorMessage: null,
        id: `batch-${input.pageNumbers.join("-")}`,
        incompleteReason: null,
        materialExtractionId: record.id,
        maxOutputTokens: 16000,
        model: input.model ?? "test-ocr",
        outputCharCount: input.textContent?.length ?? 0,
        pageEnd: input.pageNumbers.at(-1),
        pageStart: input.pageNumbers[0],
        promptVersion: "page-coverage-v1",
        sourceSha256: pdfUpload.contentSha256,
        status: input.status,
        textContent: input.textContent ?? null,
        tripId: record.tripId,
        updatedAt: new Date().toISOString(),
        uploadId: record.uploadId,
        usage: null,
      };
    };
    openai.createOpenAIOcrText = async (
      _input: unknown,
      options: { originalPageNumbers?: number[] }
    ) => {
      const pages = options.originalPageNumbers ?? [];

      if (pages.length === 4) {
        throw new openai.OpenAIExtractionRequestError(
          "OpenAI OCR returned an incomplete response: max_output_tokens.",
          null,
          {
            failureClass: "ocr_incomplete_response",
            incompleteReason: "max_output_tokens",
          }
        );
      }

      return {
        model: "test-ocr",
        pageNumbers: pages,
        text: pages
          .map((pageNumber) => `=== Page ${pageNumber} ===\nText ${pageNumber}`)
          .join("\n"),
        usage: { output_tokens: 20 },
      };
    };

    try {
      const { processTripOcrNeededMaterials } = require("@/lib/extraction/ocr-processor");
      const summary = await processTripOcrNeededMaterials({
        tripId: record.tripId,
        uploads: [pdfUpload],
      });

      assert.equal(record.status, "text_ready");
      assert.equal(summary.completed, 1);
      assert.equal(summary.pageBatches, 2);
      assert.equal(summary.pagesCompleted, 4);
      assert.equal(summary.retriedPageBatches, 1);
      assert.match(completedText, /=== Page 1 ===/);
      assert.match(completedText, /=== Page 4 ===/);
      assert.deepEqual(savedStatuses, [
        "1-2-3-4:processing",
        "1-2-3-4:incomplete",
        "1-2:processing",
        "3-4:processing",
        "1-2:completed",
        "3-4:completed",
      ]);
    } finally {
      materialExtractions.completeMaterialExtractionOcr =
        originals.completeMaterialExtractionOcr;
      materialExtractions.failMaterialExtractionOcr =
        originals.failMaterialExtractionOcr;
      materialExtractions.listOcrNeededMaterialExtractions =
        originals.listOcrNeededMaterialExtractions;
      materialExtractions.markMaterialExtractionOcrProcessing =
        originals.markMaterialExtractionOcrProcessing;
      materialExtractions.requeueStaleOcrProcessingCheckpoints =
        originals.requeueStaleOcrProcessingCheckpoints;
      tripMaterials.downloadMaterialFile = originals.downloadMaterialFile;
      openai.createOpenAIOcrText = originals.createOpenAIOcrText;
      ocrBatches.listReusableCompletedOcrBatches =
        originals.listReusableCompletedOcrBatches;
      ocrBatches.saveOcrBatchCheckpoint = originals.saveOcrBatchCheckpoint;
      pdfPageBatches.createPdfPageBatcher = originals.createPdfPageBatcher;
    }
  });
}
