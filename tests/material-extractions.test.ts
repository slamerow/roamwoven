import assert from "node:assert/strict";
import {
  completeMaterialExtractionOcr,
  failMaterialExtractionOcr,
  getMaterialExtractionReadinessIssue,
  getMaterialOcrReadinessIssue,
  materialFromCheckpoint,
  upsertMaterialExtractionCheckpoint,
  type MaterialExtractionRecord,
} from "@/lib/extraction/material-extractions";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function checkpoint(
  overrides: Partial<MaterialExtractionRecord> = {}
): MaterialExtractionRecord {
  return {
    id: "checkpoint-1",
    completedAt: "2026-06-19T12:00:00.000Z",
    createdAt: "2026-06-19T12:00:00.000Z",
    errorMessage: null,
    extractedCharCount: 24,
    extractionMethod: "pdf_text",
    failureClass: null,
    metadata: {},
    status: "text_ready",
    textContent: "Flight and hotel details.",
    tripId: "trip-1",
    updatedAt: "2026-06-19T12:00:00.000Z",
    uploadId: "upload-1",
    ...overrides,
  };
}

export default async function run() {
  await test("text-ready checkpoints become model extraction materials", () => {
    const material = materialFromCheckpoint({
      filename: "reservation.pdf",
      record: checkpoint(),
      type: "pdf_text",
    });

    assert.deepEqual(material, {
      filename: "reservation.pdf",
      sourceProvenance: "text_layer",
      sourceUploadId: "upload-1",
      text: "Flight and hotel details.",
      type: "pdf_text",
    });
  });

  await test("ocr-needed checkpoints do not become model extraction materials yet", () => {
    const material = materialFromCheckpoint({
      filename: "scanned-ticket.pdf",
      record: checkpoint({
        failureClass: "pdf_text_too_sparse",
        status: "ocr_needed",
        textContent: null,
      }),
      type: "pdf_text",
    });

    assert.equal(material, null);
  });

  await test("readable PDFs awaiting OCR do not seed model extraction until OCR finishes", () => {
    const material = materialFromCheckpoint({
      filename: "image-rich-itinerary.pdf",
      record: checkpoint({
        failureClass: "ocr_backfill_needed",
        status: "ocr_needed",
        textContent: "Readable PDF text while OCR is pending.",
      }),
      type: "pdf_text",
    });

    assert.equal(material, null);
  });

  await test("checkpoint writes cap stored text while preserving extracted character count", async () => {
    const originalCreateSupabaseServerClient =
      require("@/lib/supabase/server").createSupabaseServerClient;
    const longText = "A".repeat(90000);
    let savedPayload: Record<string, unknown> | null = null;

    require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
      from: () => ({
        upsert: (payload: Record<string, unknown>) => {
          savedPayload = payload;

          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "checkpoint-1",
                  completed_at: "2026-06-19T12:00:00.000Z",
                  created_at: "2026-06-19T12:00:00.000Z",
                  error_message: null,
                  extracted_char_count: payload.extracted_char_count,
                  extraction_method: payload.extraction_method,
                  failure_class: payload.failure_class,
                  metadata: payload.metadata,
                  status: payload.status,
                  text_content: payload.text_content,
                  trip_id: payload.trip_id,
                  updated_at: payload.updated_at,
                  upload_id: payload.upload_id,
                },
                error: null,
              }),
            }),
          };
        },
      }),
    });

    try {
      const record = await upsertMaterialExtractionCheckpoint({
        extractionMethod: "pdf_text",
        status: "text_ready",
        textContent: longText,
        tripId: "trip-1",
        uploadId: "upload-1",
      });

      assert.equal(record.extractedCharCount, longText.length);
      assert.ok(record.textContent);
      assert.ok(record.textContent.length < longText.length);
      assert.equal(record.metadata.storedTextContentTruncated, true);
      assert.equal(
        (savedPayload as Record<string, unknown> | null)?.extracted_char_count,
        longText.length
      );
    } finally {
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    }
  });

  await test("completed OCR writes text-ready checkpoint with provider metadata", async () => {
    const originalCreateSupabaseServerClient =
      require("@/lib/supabase/server").createSupabaseServerClient;
    let savedPayload: Record<string, unknown> | null = null;

    require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
      from: () => ({
        upsert: (payload: Record<string, unknown>) => {
          savedPayload = payload;

          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "checkpoint-1",
                  completed_at: "2026-06-19T12:00:00.000Z",
                  created_at: "2026-06-19T12:00:00.000Z",
                  error_message: null,
                  extracted_char_count: payload.extracted_char_count,
                  extraction_method: payload.extraction_method,
                  failure_class: payload.failure_class,
                  metadata: payload.metadata,
                  status: payload.status,
                  text_content: payload.text_content,
                  trip_id: payload.trip_id,
                  updated_at: payload.updated_at,
                  upload_id: payload.upload_id,
                },
                error: null,
              }),
            }),
          };
        },
      }),
    });

    try {
      const record = await completeMaterialExtractionOcr({
        provider: "test-ocr",
        record: checkpoint({
          metadata: { source: "unit-test" },
          status: "ocr_processing",
          textContent: null,
        }),
        text: "OCR flight text",
      });

      assert.equal(record.status, "text_ready");
      assert.equal(record.extractionMethod, "ocr");
      assert.equal(record.textContent, "OCR flight text");
      assert.equal(record.metadata.ocrProvider, "test-ocr");
      assert.equal(record.metadata.source, "unit-test");
      assert.equal((savedPayload as Record<string, unknown> | null)?.status, "text_ready");
    } finally {
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    }
  });

  await test("completed OCR backfills existing PDF text instead of replacing it", async () => {
    const originalCreateSupabaseServerClient =
      require("@/lib/supabase/server").createSupabaseServerClient;

    require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
      from: () => ({
        upsert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({
              data: {
                id: "checkpoint-1",
                completed_at: "2026-06-19T12:00:00.000Z",
                created_at: "2026-06-19T12:00:00.000Z",
                error_message: null,
                extracted_char_count: payload.extracted_char_count,
                extraction_method: payload.extraction_method,
                failure_class: payload.failure_class,
                metadata: payload.metadata,
                status: payload.status,
                text_content: payload.text_content,
                trip_id: payload.trip_id,
                updated_at: payload.updated_at,
                upload_id: payload.upload_id,
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    try {
      const record = await completeMaterialExtractionOcr({
        provider: "test-ocr",
        record: checkpoint({
          metadata: { pdfTextCharCount: 23 },
          status: "ocr_processing",
          textContent: "PDF text: flight summary.",
        }),
        text: "OCR text: Budapest Keleti arrival.",
      });

      assert.equal(record.status, "text_ready");
      assert.match(record.textContent ?? "", /PDF text: flight summary/);
      assert.match(record.textContent ?? "", /Budapest Keleti/);
      assert.equal(record.metadata.ocrBackfilledPdfText, true);
    } finally {
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    }
  });

  await test("failed OCR preserves fallback text for debug but blocks extraction", async () => {
    const originalCreateSupabaseServerClient =
      require("@/lib/supabase/server").createSupabaseServerClient;

    require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
      from: () => ({
        upsert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({
              data: {
                id: "checkpoint-1",
                completed_at: "2026-06-19T12:00:00.000Z",
                created_at: "2026-06-19T12:00:00.000Z",
                error_message: payload.error_message,
                extracted_char_count: payload.extracted_char_count,
                extraction_method: payload.extraction_method,
                failure_class: payload.failure_class,
                metadata: payload.metadata,
                status: payload.status,
                text_content: payload.text_content,
                trip_id: payload.trip_id,
                updated_at: payload.updated_at,
                upload_id: payload.upload_id,
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    try {
      const record = await failMaterialExtractionOcr({
        errorMessage: "OCR provider timeout.",
        provider: "test-ocr",
        record: checkpoint({
          status: "ocr_processing",
          textContent: "Readable PDF text survives.",
        }),
      });

      assert.equal(record.status, "failed");
      assert.equal(record.extractionMethod, "ocr");
      assert.equal(record.textContent, "Readable PDF text survives.");
      assert.equal(record.metadata.ocrFailedTextFallbackAvailable, true);
      assert.equal(
        materialFromCheckpoint({
          filename: "image-rich.pdf",
          record,
          type: "pdf_text",
        }),
        null
      );
    } finally {
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    }
  });

  await test("pending OCR checkpoints block model extraction readiness", () => {
    assert.equal(
      getMaterialOcrReadinessIssue([
        checkpoint({
          failureClass: "ocr_backfill_needed",
          status: "ocr_needed",
          textContent: "Readable PDF text while OCR is pending.",
        }),
      ]),
      "ocr-incomplete"
    );

    assert.equal(
      getMaterialOcrReadinessIssue([
        checkpoint({
          status: "ocr_processing",
          textContent: "Readable PDF text while OCR is processing.",
        }),
      ]),
      "ocr-incomplete"
    );
  });

  await test("pending material checkpoints block extraction start", () => {
    assert.equal(
      getMaterialExtractionReadinessIssue([
        checkpoint({
          status: "pending",
          textContent: null,
        }),
      ]),
      "material-incomplete"
    );
  });

  await test("OCR failures block model extraction readiness", () => {
    assert.equal(
      getMaterialOcrReadinessIssue([
        checkpoint({
          extractionMethod: "ocr",
          failureClass: "ocr_no_embedded_image_text",
          metadata: { ocrProvider: "test-ocr" },
          status: "failed",
          textContent: "Readable fallback text.",
        }),
      ]),
      "ocr-failed"
    );

    assert.equal(
      getMaterialOcrReadinessIssue([
        checkpoint({
          extractionMethod: "pdf_text",
          failureClass: "pdf_text_extract_failed",
          status: "failed",
          textContent: null,
        }),
      ]),
      null
    );
  });
}
