import assert from "node:assert/strict";
import {
  createTripExtractionMaterialsIdempotencyKey,
  dedupeTripExtractionMaterials,
  getTripExtractionMaterialSourceUploadIds,
} from "@/lib/extraction/trip-materials";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";
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
    createdAt: "2026-07-09T00:00:00.000Z",
    fileSizeBytes: 1000,
    fileType: "application/pdf",
    id: "upload-1",
    originalFilename: "source.pdf",
    processingStatus: "ready",
    sourceKind: "file",
    storagePath: "trip/source.pdf",
    tripId: "trip-1",
    userNote: null,
    ...overrides,
  };
}

function material(
  overrides: Partial<TripExtractionMaterial>
): TripExtractionMaterial {
  return {
    filename: "source.pdf",
    sourceProvenance: "text_layer",
    sourceUploadId: "upload-1",
    text: "Thursday, January 24, 2019. Train to Vienna departs 09:20 from Praha Hlavni Nadrazi and arrives 13:23 at Wien Hauptbahnhof.",
    type: "pdf_text",
    ...overrides,
  };
}

test("duplicate source materials collapse before model input", () => {
  const result = dedupeTripExtractionMaterials({
    materials: [
      material({ sourceUploadId: "upload-a" }),
      material({
        filename: "duplicate.pdf",
        sourceUploadId: "upload-b",
      }),
    ],
    uploads: [
      upload({ contentSha256: "same-content", id: "upload-a" }),
      upload({
        contentSha256: "same-content",
        id: "upload-b",
        originalFilename: "duplicate.pdf",
      }),
    ],
  });

  assert.equal(result.materials.length, 1);
  assert.deepEqual(result.materials[0]?.dedupedSourceUploadIds, [
    "upload-a",
    "upload-b",
  ]);
  assert.deepEqual(result.dedupeSummary, {
    duplicateMaterialCount: 1,
    originalMaterialCount: 2,
    representedSourceUploadIds: ["upload-a", "upload-b"],
    submittedMaterialCount: 1,
  });
  assert.deepEqual(getTripExtractionMaterialSourceUploadIds(result.materials), [
    "upload-a",
    "upload-b",
  ]);
});

test("material idempotency ignores duplicate upload rows", () => {
  const original = dedupeTripExtractionMaterials({
    materials: [material({ sourceUploadId: "upload-a" })],
    uploads: [upload({ contentSha256: "same-content", id: "upload-a" })],
  });
  const withDuplicate = dedupeTripExtractionMaterials({
    materials: [
      material({ sourceUploadId: "upload-a" }),
      material({
        filename: "duplicate.pdf",
        sourceUploadId: "upload-b",
      }),
    ],
    uploads: [
      upload({ contentSha256: "same-content", id: "upload-a" }),
      upload({
        contentSha256: "same-content",
        id: "upload-b",
        originalFilename: "duplicate.pdf",
      }),
    ],
  });

  assert.equal(
    createTripExtractionMaterialsIdempotencyKey({
      materials: original.materials,
    }),
    createTripExtractionMaterialsIdempotencyKey({
      materials: withDuplicate.materials,
    })
  );
  assert.notEqual(
    createTripExtractionMaterialsIdempotencyKey({
      failedRunId: "run-failed",
      materials: original.materials,
    }),
    createTripExtractionMaterialsIdempotencyKey({
      materials: original.materials,
    })
  );
});
