import assert from "node:assert/strict";
import {
  canSeedInitialExtraction,
  MAX_INITIAL_OCR_FILE_BYTES,
  MAX_INITIAL_OFFICE_FILE_BYTES,
  MAX_INITIAL_PDF_FILE_BYTES,
  MAX_INITIAL_TEXT_FILE_BYTES,
} from "@/lib/extraction/material-capabilities";
import type { TripUpload } from "@/lib/uploads";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function upload(overrides: Partial<TripUpload>): TripUpload {
  return {
    contentSha256: null,
    createdAt: "2026-06-23T12:00:00.000Z",
    fileSizeBytes: null,
    fileType: null,
    id: "upload-1",
    originalFilename: "material",
    processingStatus: "uploaded",
    sourceKind: "file",
    storagePath: "user/trip/upload/material",
    tripId: "trip-1",
    userNote: null,
    ...overrides,
  };
}

test("pasted notes can seed initial extraction", () => {
  assert.equal(
    canSeedInitialExtraction(
      upload({
        originalFilename: "Pasted notes",
        sourceKind: "note",
        storagePath: null,
        userNote: "Hotel and flight notes",
      })
    ),
    true
  );
});

test("small text files can seed initial extraction", () => {
  assert.equal(
    canSeedInitialExtraction(
      upload({
        fileSizeBytes: MAX_INITIAL_TEXT_FILE_BYTES,
        fileType: "text/plain",
        originalFilename: "trip.txt",
      })
    ),
    true
  );
});

test("supported images can seed OCR-backed initial extraction", () => {
  assert.equal(
    canSeedInitialExtraction(
      upload({
        fileSizeBytes: MAX_INITIAL_OCR_FILE_BYTES,
        fileType: "image/png",
        originalFilename: "reservation-screenshot.png",
      })
    ),
    true
  );
});

test("PDFs can seed text or OCR-backed initial extraction", () => {
  assert.equal(
    canSeedInitialExtraction(
      upload({
        fileSizeBytes: MAX_INITIAL_PDF_FILE_BYTES,
        fileType: "application/pdf",
        originalFilename: "hotel-confirmation.pdf",
      })
    ),
    true
  );
});

test("DOCX, XLSX, and CSV files seed initial extraction", () => {
  assert.equal(
    canSeedInitialExtraction(
      upload({
        fileSizeBytes: MAX_INITIAL_OFFICE_FILE_BYTES,
        fileType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        originalFilename: "itinerary.docx",
      })
    ),
    true
  );

  assert.equal(
    canSeedInitialExtraction(
      upload({
        fileSizeBytes: MAX_INITIAL_OFFICE_FILE_BYTES,
        fileType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        originalFilename: "itinerary.xlsx",
      })
    ),
    true
  );

  assert.equal(
    canSeedInitialExtraction(
      upload({
        fileSizeBytes: MAX_INITIAL_TEXT_FILE_BYTES,
        fileType: "text/csv",
        originalFilename: "itinerary.csv",
      })
    ),
    true
  );
});

test("legacy and macro-enabled Office files remain rejected", () => {
  for (const originalFilename of ["itinerary.doc", "itinerary.xls", "itinerary.xlsm"]) {
    assert.equal(
      canSeedInitialExtraction(
        upload({
          fileSizeBytes: 10_000,
          fileType: "application/octet-stream",
          originalFilename,
        })
      ),
      false
    );
  }
});
