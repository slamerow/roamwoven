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
      tripMaterials.downloadMaterialFile = originals.downloadMaterialFile;
      openai.createOpenAIOcrText = originals.createOpenAIOcrText;
    }
  });
}
