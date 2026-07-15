import { createHash } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TripUpload } from "@/lib/uploads";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";
import {
  listMaterialExtractionCheckpoints,
  materialFromCheckpoint,
  upsertMaterialExtractionCheckpoint,
} from "@/lib/extraction/material-extractions";
import {
  extractCsvMaterial,
  extractDocxMaterial,
  extractXlsxMaterial,
} from "@/lib/extraction/document-material-parser";
import { MaterialParserError } from "@/lib/extraction/material-parser-errors";
import {
  getMaterialCapability,
  MAX_INITIAL_PDF_FILE_BYTES,
  MAX_INITIAL_TEXT_FILE_BYTES,
} from "@/lib/extraction/material-capabilities";

const TRIP_MATERIALS_BUCKET = "trip-materials";
const MIN_READABLE_PDF_TEXT_LENGTH = 50;
const MATERIAL_EXTRACTION_CONCURRENCY = 3;
const MIN_LARGE_PDF_IMAGE_AREA = 30000;
const MIN_LARGE_PDF_IMAGE_HEIGHT = 80;
const MIN_LARGE_PDF_IMAGE_WIDTH = 180;
const MIN_TEXT_DEDUPE_CHARS = 80;

export type TripExtractionMaterialDedupeSummary = {
  duplicateMaterialCount: number;
  originalMaterialCount: number;
  representedSourceUploadIds: string[];
  submittedMaterialCount: number;
};

export type TripExtractionMaterialPreparation = {
  dedupeSummary: TripExtractionMaterialDedupeSummary;
  materials: TripExtractionMaterial[];
};

type TripExtractionMaterialOptions = {
  retryFailedOcr?: boolean;
};

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
  const capability = getMaterialCapability(upload.originalFilename);

  return capability?.kind === "pdf" || capability?.kind === "image";
}

function getMaterialTypeForRecord(
  upload: TripUpload
): TripExtractionMaterial["type"] {
  if (upload.sourceKind === "note" || upload.userNote?.trim()) {
    return "note";
  }

  return getMaterialCapability(upload.originalFilename)?.kind === "pdf"
    ? "pdf_text"
    : "file_text";
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTextIdentity(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));
}

function getMaterialSourceUploadIds(material: TripExtractionMaterial) {
  return uniqueSorted([
    material.sourceUploadId,
    ...(material.dedupedSourceUploadIds ?? []),
  ]);
}

export function getTripExtractionMaterialSourceUploadIds(
  materials: TripExtractionMaterial[]
) {
  return uniqueSorted(materials.flatMap(getMaterialSourceUploadIds));
}

function createUploadLookup(uploads: TripUpload[]) {
  return new Map(uploads.map((upload) => [upload.id, upload]));
}

function getMaterialDedupeKey({
  material,
  upload,
}: {
  material: TripExtractionMaterial;
  upload: TripUpload | undefined;
}) {
  const contentHash = upload?.contentSha256?.trim();

  if (contentHash) {
    return `content:${contentHash}`;
  }

  const normalizedText = normalizeTextIdentity(material.text);

  if (normalizedText.length >= MIN_TEXT_DEDUPE_CHARS) {
    return `text:${sha256Hex(normalizedText)}`;
  }

  return null;
}

function mergeMaterialSourceIds(
  target: TripExtractionMaterial,
  duplicate: TripExtractionMaterial
) {
  return {
    ...target,
    dedupedSourceUploadIds: uniqueSorted([
      ...getMaterialSourceUploadIds(target),
      ...getMaterialSourceUploadIds(duplicate),
    ]),
  };
}

export function dedupeTripExtractionMaterials({
  materials,
  uploads,
}: {
  materials: TripExtractionMaterial[];
  uploads: TripUpload[];
}): TripExtractionMaterialPreparation {
  const uploadById = createUploadLookup(uploads);
  const byKey = new Map<string, TripExtractionMaterial>();
  const deduped: TripExtractionMaterial[] = [];

  for (const material of materials) {
    const key = getMaterialDedupeKey({
      material,
      upload: material.sourceUploadId
        ? uploadById.get(material.sourceUploadId)
        : undefined,
    });

    if (!key) {
      deduped.push(material);
      continue;
    }

    const existing = byKey.get(key);

    if (existing) {
      byKey.set(key, mergeMaterialSourceIds(existing, material));
      continue;
    }

    byKey.set(key, material);
    deduped.push(material);
  }

  const preparedMaterials = deduped.map((material) => {
    const key = getMaterialDedupeKey({
      material,
      upload: material.sourceUploadId
        ? uploadById.get(material.sourceUploadId)
        : undefined,
    });

    return key && byKey.has(key) ? (byKey.get(key) ?? material) : material;
  });

  return {
    dedupeSummary: {
      duplicateMaterialCount: materials.length - preparedMaterials.length,
      originalMaterialCount: materials.length,
      representedSourceUploadIds:
        getTripExtractionMaterialSourceUploadIds(preparedMaterials),
      submittedMaterialCount: preparedMaterials.length,
    },
    materials: preparedMaterials,
  };
}

export function createTripExtractionMaterialsIdempotencyKey({
  failedRunId,
  materials,
}: {
  failedRunId?: string;
  materials: TripExtractionMaterial[];
}) {
  const identity = materials
    .map((material) => ({
      provenance: material.sourceProvenance ?? "unknown",
      textHash: sha256Hex(normalizeTextIdentity(material.text)),
      type: material.type,
    }))
    .sort((a, b) =>
      [
        a.type.localeCompare(b.type),
        a.textHash.localeCompare(b.textHash),
        a.provenance.localeCompare(b.provenance),
      ].find((value) => value !== 0) ?? 0
    );

  return createHash("sha256")
    .update(JSON.stringify({ failedRunId: failedRunId ?? null, identity }))
    .digest("hex");
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

export async function downloadMaterialFile(upload: TripUpload) {
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
      getMaterialCapability(upload.originalFilename)?.kind === "text" &&
      Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_TEXT_FILE_BYTES
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

type PdfExtractionResult = {
  embeddedImageCount: number;
  largeEmbeddedImageCount: number;
  pageCount: number;
  text: string;
};

function getPdfImageOperatorCodes(pdfjs: unknown) {
  const ops =
    pdfjs && typeof pdfjs === "object" && "OPS" in pdfjs
      ? ((pdfjs as { OPS?: Record<string, number> }).OPS ?? {})
      : {};

  return new Set(
    [
      ops.paintImageXObject,
      ops.paintImageMaskXObject,
      ops.paintInlineImageXObject,
      ops.paintInlineImageXObjectGroup,
      ops.paintJpegXObject,
      ops.paintXObject,
    ].filter((code): code is number => typeof code === "number")
  );
}

function isLargePdfImage(args: unknown[] | undefined) {
  if (!Array.isArray(args)) {
    return false;
  }

  const width = Number(args[1] ?? 0);
  const height = Number(args[2] ?? 0);

  return (
    width >= MIN_LARGE_PDF_IMAGE_WIDTH &&
    height >= MIN_LARGE_PDF_IMAGE_HEIGHT &&
    width * height >= MIN_LARGE_PDF_IMAGE_AREA
  );
}

async function extractPdfText(file: Blob): Promise<PdfExtractionResult> {
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
    const imageOperatorCodes = getPdfImageOperatorCodes(pdfjs);
    let embeddedImageCount = 0;
    let largeEmbeddedImageCount = 0;
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

      if (imageOperatorCodes.size > 0) {
        const operatorList = await page.getOperatorList();
        operatorList.fnArray.forEach((code, index) => {
          if (!imageOperatorCodes.has(Number(code))) {
            return;
          }

          embeddedImageCount += 1;

          if (isLargePdfImage(operatorList.argsArray[index])) {
            largeEmbeddedImageCount += 1;
          }
        });
      }

      page.cleanup();
    }

    return {
      embeddedImageCount,
      largeEmbeddedImageCount,
      pageCount: document.numPages,
      text: pages.join("\n\n").trim(),
    };
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
      getMaterialCapability(upload.originalFilename)?.kind === "pdf" &&
      Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_PDF_FILE_BYTES
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
      const result = await extractPdfText(data);
      const text = result.text;

      if (text.length >= MIN_READABLE_PDF_TEXT_LENGTH) {
        console.info("trip_material_pdf_text_extracted", {
              charCount: text.length,
              embeddedImageCount: result.embeddedImageCount,
              fileName: upload.originalFilename,
              largeEmbeddedImageCount: result.largeEmbeddedImageCount,
              pageCount: result.pageCount,
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

function isFailedOcrCheckpoint(
  checkpoint: Awaited<ReturnType<typeof listMaterialExtractionCheckpoints>>[number]
) {
  return Boolean(
    checkpoint.status === "failed" &&
      (checkpoint.extractionMethod === "ocr" ||
        checkpoint.metadata.ocrProvider ||
        checkpoint.failureClass?.includes("ocr") ||
        checkpoint.failureClass?.startsWith("openai_"))
  );
}

export async function getTripExtractionMaterialsWithSummary(
  uploads: TripUpload[],
  { retryFailedOcr = true }: TripExtractionMaterialOptions = {}
): Promise<TripExtractionMaterialPreparation> {
  const tripId = uploads.find((upload) => upload.tripId)?.tripId;
  const existingCheckpoints = tripId
    ? await listMaterialExtractionCheckpoints(tripId)
    : [];
  const checkpointsByUploadId = new Map(
    existingCheckpoints.map((checkpoint) => [checkpoint.uploadId, checkpoint])
  );
  const materialLists = await mapWithConcurrency(
    uploads,
    MATERIAL_EXTRACTION_CONCURRENCY,
    async (upload) => {
      const materials: TripExtractionMaterial[] = [];

      try {
        const existingCheckpoint = checkpointsByUploadId.get(upload.id);

        if (
          existingCheckpoint?.status === "text_ready" ||
          (existingCheckpoint?.status === "failed" &&
            existingCheckpoint.metadata.ocrFailedTextFallbackAvailable === true)
        ) {
          const material = materialFromCheckpoint({
            filename: upload.originalFilename,
            record: existingCheckpoint,
            type: getMaterialTypeForRecord(upload),
          });

          return material ? [material] : materials;
        }

        if (
          existingCheckpoint?.status === "ocr_needed" ||
          existingCheckpoint?.status === "ocr_processing" ||
          (existingCheckpoint &&
            isFailedOcrCheckpoint(existingCheckpoint) &&
            !retryFailedOcr) ||
          (existingCheckpoint?.status === "unsupported" &&
            !getMaterialCapability(upload.originalFilename))
        ) {
          return materials;
        }

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
        getMaterialCapability(upload.originalFilename)?.kind === "text" &&
        Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_TEXT_FILE_BYTES
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

      const structuredFileKind = getMaterialCapability(
        upload.originalFilename
      )?.kind;

      if (
        structuredFileKind === "csv" ||
        structuredFileKind === "docx" ||
        structuredFileKind === "xlsx"
      ) {
        const data = await downloadMaterialFile(upload);

        if (!data) {
          await upsertMaterialExtractionCheckpoint({
            errorMessage: `Unable to download saved ${structuredFileKind.toUpperCase()} material.`,
            extractionMethod: structuredFileKind,
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
          const buffer = Buffer.from(await data.arrayBuffer());
          const result =
            structuredFileKind === "docx"
              ? await extractDocxMaterial({
                  buffer,
                  filename: upload.originalFilename,
                })
              : structuredFileKind === "xlsx"
                ? await extractXlsxMaterial({
                    buffer,
                    filename: upload.originalFilename,
                  })
                : extractCsvMaterial({
                    buffer,
                    filename: upload.originalFilename,
                  });
          const record = await upsertMaterialExtractionCheckpoint({
            errorMessage: result.text
              ? null
              : "No readable visible text was found in this file.",
            extractedCharCount: result.text.length,
            extractionMethod: structuredFileKind,
            failureClass: result.text ? null : "no_readable_visible_content",
            metadata: {
              ...result.metadata,
              fileName: upload.originalFilename,
              fileSizeBytes: upload.fileSizeBytes,
              fileType: upload.fileType,
            },
            status: result.text ? "text_ready" : "failed",
            textContent: result.text,
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
        } catch (error) {
          await upsertMaterialExtractionCheckpoint({
            errorMessage:
              error instanceof Error
                ? error.message
                : `Unknown ${structuredFileKind.toUpperCase()} extraction error.`,
            extractionMethod: structuredFileKind,
            failureClass:
              error instanceof MaterialParserError
                ? error.failureClass
                : `${structuredFileKind}_parse_failed`,
            metadata: {
              ...(error instanceof MaterialParserError ? error.metadata : {}),
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

      if (
        getMaterialCapability(upload.originalFilename)?.kind === "pdf" &&
        Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_PDF_FILE_BYTES
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
          const result = await extractPdfText(data);
          const text = result.text;
          const readable = text.length >= MIN_READABLE_PDF_TEXT_LENGTH;
          const hasLargeEmbeddedImages = result.largeEmbeddedImageCount > 0;
          const needsOcr = hasLargeEmbeddedImages || !readable;
          const record = await upsertMaterialExtractionCheckpoint({
            extractedCharCount: text.length,
            extractionMethod: "pdf_text",
            failureClass: needsOcr
              ? readable
                ? "ocr_backfill_needed"
                : "pdf_text_too_sparse"
              : null,
            metadata: {
              embeddedImageCount: result.embeddedImageCount,
              fileName: upload.originalFilename,
              fileSizeBytes: upload.fileSizeBytes,
              fileType: upload.fileType,
              largeEmbeddedImageCount: result.largeEmbeddedImageCount,
              ocrBackfillRequested: needsOcr,
              ocrRequiredReason: hasLargeEmbeddedImages
                ? "large_embedded_images"
                : readable
                  ? null
                  : "pdf_text_too_sparse",
              pageCount: result.pageCount,
              minReadableTextLength: MIN_READABLE_PDF_TEXT_LENGTH,
              pdfTextCharCount: text.length,
            },
            status: needsOcr ? "ocr_needed" : "text_ready",
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

  return dedupeTripExtractionMaterials({
    materials: materialLists.flat().filter((material) => material.text.trim()),
    uploads,
  });
}

export async function getTripExtractionMaterials(uploads: TripUpload[]) {
  return (await getTripExtractionMaterialsWithSummary(uploads)).materials;
}
