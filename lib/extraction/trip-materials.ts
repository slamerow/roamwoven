import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TripUpload } from "@/lib/uploads";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";
import {
  materialFromCheckpoint,
  upsertMaterialExtractionCheckpoint,
} from "@/lib/extraction/material-extractions";

const TRIP_MATERIALS_BUCKET = "trip-materials";
const MAX_TEXT_FILE_BYTES = 250 * 1024;
const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024;
const MIN_READABLE_PDF_TEXT_LENGTH = 50;
const MATERIAL_EXTRACTION_CONCURRENCY = 3;

class MinimalDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | string) {
    if (Array.isArray(init)) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = [
        Number(init[0] ?? 1),
        Number(init[1] ?? 0),
        Number(init[2] ?? 0),
        Number(init[3] ?? 1),
        Number(init[4] ?? 0),
        Number(init[5] ?? 0),
      ];
    }
  }
}

function ensurePdfParserGlobals() {
  const globals = globalThis as Record<string, unknown>;

  globals.DOMMatrix ??= MinimalDOMMatrix;
}

export function getNoteExtractionMaterials(
  uploads: TripUpload[]
): TripExtractionMaterial[] {
  return uploads
    .filter((upload) => upload.userNote?.trim())
    .map((upload) => ({
      filename: upload.originalFilename,
      sourceUploadId: upload.id,
      text: upload.userNote?.trim() ?? "",
      type: "note" as const,
    }));
}

function isOcrCandidate(upload: TripUpload) {
  return (
    upload.fileType === "application/pdf" ||
    upload.fileType === "image/jpeg" ||
    upload.fileType === "image/png" ||
    upload.fileType === "image/webp"
  );
}

function getMaterialTypeForRecord(
  upload: TripUpload
): TripExtractionMaterial["type"] {
  if (upload.sourceKind === "note" || upload.userNote?.trim()) {
    return "note";
  }

  return upload.fileType === "application/pdf" ? "pdf_text" : "file_text";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(chunk.map(fn))));
  }

  return results;
}

async function downloadMaterialFile(upload: TripUpload) {
  if (!upload.storagePath) {
    return null;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .download(upload.storagePath);

    if (!error && data) {
      return data;
    }

    console.warn("trip_material_admin_download_failed", {
      fileName: upload.originalFilename,
      message: error?.message ?? "No file data returned.",
      tripId: upload.tripId,
    });
  } catch (error) {
    console.warn("trip_material_admin_download_unavailable", {
      fileName: upload.originalFilename,
      message: error instanceof Error ? error.message : "Unknown error.",
      tripId: upload.tripId,
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(TRIP_MATERIALS_BUCKET)
    .download(upload.storagePath);

  if (error || !data) {
    console.warn("trip_material_download_failed", {
      fileName: upload.originalFilename,
      message: error?.message ?? "No file data returned.",
      tripId: upload.tripId,
    });
    return null;
  }

  return data;
}

export async function getTextFileExtractionMaterials(
  uploads: TripUpload[]
): Promise<TripExtractionMaterial[]> {
  const textUploads = uploads.filter(
    (upload) =>
      upload.storagePath &&
      upload.fileType === "text/plain" &&
      Number(upload.fileSizeBytes ?? 0) <= MAX_TEXT_FILE_BYTES
  );

  if (textUploads.length === 0) {
    return [];
  }

  const materials: TripExtractionMaterial[] = [];

  for (const upload of textUploads) {
    const data = await downloadMaterialFile(upload);

    if (!data) {
      continue;
    }

    materials.push({
      filename: upload.originalFilename,
      sourceUploadId: upload.id,
      text: await data.text(),
      type: "file_text",
    });
  }

  return materials;
}

async function extractPdfText(file: Blob) {
  ensurePdfParserGlobals();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

  const buffer = await file.arrayBuffer();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
  });
  const document = await task.promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .trim();

      if (text) {
        pages.push(text);
      }

      page.cleanup();
    }

    return pages.join("\n\n").trim();
  } finally {
    await document.destroy();
  }
}

export async function getPdfExtractionMaterials(
  uploads: TripUpload[]
): Promise<TripExtractionMaterial[]> {
  const pdfUploads = uploads.filter(
    (upload) =>
      upload.storagePath &&
      upload.fileType === "application/pdf" &&
      Number(upload.fileSizeBytes ?? 0) <= MAX_PDF_FILE_BYTES
  );

  if (pdfUploads.length === 0) {
    return [];
  }

  const materials: TripExtractionMaterial[] = [];

  for (const upload of pdfUploads) {
    const data = await downloadMaterialFile(upload);

    if (!data) {
      continue;
    }

    try {
      const text = await extractPdfText(data);

      if (text.length >= MIN_READABLE_PDF_TEXT_LENGTH) {
        console.info("trip_material_pdf_text_extracted", {
          charCount: text.length,
          fileName: upload.originalFilename,
          tripId: upload.tripId,
        });
        materials.push({
          filename: upload.originalFilename,
          sourceUploadId: upload.id,
          text,
          type: "pdf_text",
        });
      }
    } catch (error) {
      console.warn("trip_material_pdf_text_extract_failed", {
        fileName: upload.originalFilename,
        message: error instanceof Error ? error.message : "Unknown error.",
        tripId: upload.tripId,
      });
      continue;
    }
  }

  return materials;
}

export async function getTripExtractionMaterials(uploads: TripUpload[]) {
  const materialLists = await mapWithConcurrency(
    uploads,
    MATERIAL_EXTRACTION_CONCURRENCY,
    async (upload) => {
      const materials: TripExtractionMaterial[] = [];

      try {
      if (upload.userNote?.trim()) {
        const record = await upsertMaterialExtractionCheckpoint({
          extractedCharCount: upload.userNote.trim().length,
          extractionMethod: "manual_note",
          metadata: {
            fileName: upload.originalFilename,
            sourceKind: upload.sourceKind,
          },
          status: "text_ready",
          textContent: upload.userNote.trim(),
          tripId: upload.tripId,
          uploadId: upload.id,
        });
        const material = materialFromCheckpoint({
          filename: upload.originalFilename,
          record,
          type: "note",
        });

        if (material) {
          materials.push(material);
        }
        return materials;
      }

      if (!upload.storagePath) {
        await upsertMaterialExtractionCheckpoint({
          extractionMethod: "triage",
          failureClass: "no_storage_path",
          metadata: {
            fileName: upload.originalFilename,
            fileType: upload.fileType,
            sourceKind: upload.sourceKind,
          },
          status: "unsupported",
          tripId: upload.tripId,
          uploadId: upload.id,
        });
        return materials;
      }

      if (
        upload.fileType === "text/plain" &&
        Number(upload.fileSizeBytes ?? 0) <= MAX_TEXT_FILE_BYTES
      ) {
        const data = await downloadMaterialFile(upload);

        if (!data) {
          await upsertMaterialExtractionCheckpoint({
            errorMessage: "Unable to download saved text material.",
            extractionMethod: "text_file",
            failureClass: "download_failed",
            metadata: {
              fileName: upload.originalFilename,
              fileType: upload.fileType,
            },
            status: "failed",
            tripId: upload.tripId,
            uploadId: upload.id,
          });
          return materials;
        }

        const text = (await data.text()).trim();
        const record = await upsertMaterialExtractionCheckpoint({
          extractedCharCount: text.length,
          extractionMethod: "text_file",
          metadata: {
            fileName: upload.originalFilename,
            fileSizeBytes: upload.fileSizeBytes,
            fileType: upload.fileType,
          },
          status: text ? "text_ready" : "unsupported",
          textContent: text,
          tripId: upload.tripId,
          uploadId: upload.id,
        });
        const material = materialFromCheckpoint({
          filename: upload.originalFilename,
          record,
          type: "file_text",
        });

        if (material) {
          materials.push(material);
        }
        return materials;
      }

      if (
        upload.fileType === "application/pdf" &&
        Number(upload.fileSizeBytes ?? 0) <= MAX_PDF_FILE_BYTES
      ) {
        const data = await downloadMaterialFile(upload);

        if (!data) {
          await upsertMaterialExtractionCheckpoint({
            errorMessage: "Unable to download saved PDF material.",
            extractionMethod: "pdf_text",
            failureClass: "download_failed",
            metadata: {
              fileName: upload.originalFilename,
              fileType: upload.fileType,
            },
            status: "failed",
            tripId: upload.tripId,
            uploadId: upload.id,
          });
          return materials;
        }

        try {
          const text = await extractPdfText(data);
          const readable = text.length >= MIN_READABLE_PDF_TEXT_LENGTH;
          const record = await upsertMaterialExtractionCheckpoint({
            extractedCharCount: text.length,
            extractionMethod: "pdf_text",
            failureClass: readable ? null : "pdf_text_too_sparse",
            metadata: {
              fileName: upload.originalFilename,
              fileSizeBytes: upload.fileSizeBytes,
              fileType: upload.fileType,
              minReadableTextLength: MIN_READABLE_PDF_TEXT_LENGTH,
            },
            status: readable ? "text_ready" : "ocr_needed",
            textContent: readable ? text : null,
            tripId: upload.tripId,
            uploadId: upload.id,
          });
          const material = materialFromCheckpoint({
            filename: upload.originalFilename,
            record,
            type: "pdf_text",
          });

          if (material) {
            console.info("trip_material_pdf_text_extracted", {
              charCount: material.text.length,
              fileName: upload.originalFilename,
              tripId: upload.tripId,
            });
            materials.push(material);
          }
        } catch (error) {
          await upsertMaterialExtractionCheckpoint({
            errorMessage:
              error instanceof Error ? error.message : "Unknown PDF text error.",
            extractionMethod: "pdf_text",
            failureClass: "pdf_text_extract_failed",
            metadata: {
              fileName: upload.originalFilename,
              fileSizeBytes: upload.fileSizeBytes,
              fileType: upload.fileType,
            },
            status: "failed",
            tripId: upload.tripId,
            uploadId: upload.id,
          });
          console.warn("trip_material_pdf_text_extract_failed", {
            fileName: upload.originalFilename,
            message: error instanceof Error ? error.message : "Unknown error.",
            tripId: upload.tripId,
          });
        }
        return materials;
      }

      await upsertMaterialExtractionCheckpoint({
        extractionMethod: "triage",
        failureClass: isOcrCandidate(upload)
          ? "ocr_not_enabled"
          : "unsupported_file_type",
        metadata: {
          fileName: upload.originalFilename,
          fileSizeBytes: upload.fileSizeBytes,
          fileType: upload.fileType,
          materialType: getMaterialTypeForRecord(upload),
        },
        status: isOcrCandidate(upload) ? "ocr_needed" : "unsupported",
        tripId: upload.tripId,
        uploadId: upload.id,
      });
      } catch (error) {
        await upsertMaterialExtractionCheckpoint({
          errorMessage:
            error instanceof Error ? error.message : "Unknown material error.",
          extractionMethod: "triage",
          failureClass: "checkpoint_failed",
          metadata: {
            fileName: upload.originalFilename,
            fileSizeBytes: upload.fileSizeBytes,
            fileType: upload.fileType,
          },
          status: "failed",
          tripId: upload.tripId,
          uploadId: upload.id,
        });
      }
      return materials;
    }
  );

  return materialLists.flat().filter((material) => material.text.trim());
}
