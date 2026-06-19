import assert from "node:assert/strict";
import {
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
}
