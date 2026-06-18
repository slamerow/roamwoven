import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TripUpload } from "@/lib/uploads";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";

const TRIP_MATERIALS_BUCKET = "trip-materials";
const MAX_TEXT_FILE_BYTES = 250 * 1024;
const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024;
const MIN_READABLE_PDF_TEXT_LENGTH = 50;

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
      text: upload.userNote?.trim() ?? "",
      type: "note" as const,
    }));
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

  const supabase = await createSupabaseServerClient();
  const materials: TripExtractionMaterial[] = [];

  for (const upload of textUploads) {
    if (!upload.storagePath) {
      continue;
    }

    const { data, error } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .download(upload.storagePath);

    if (error || !data) {
      continue;
    }

    materials.push({
      filename: upload.originalFilename,
      text: await data.text(),
      type: "file_text",
    });
  }

  return materials;
}

async function extractPdfText(file: Blob) {
  ensurePdfParserGlobals();

  const { PDFParse } = await import("pdf-parse");
  const buffer = await file.arrayBuffer();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
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

  const supabase = await createSupabaseServerClient();
  const materials: TripExtractionMaterial[] = [];

  for (const upload of pdfUploads) {
    if (!upload.storagePath) {
      continue;
    }

    const { data, error } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .download(upload.storagePath);

    if (error || !data) {
      continue;
    }

    try {
      const text = await extractPdfText(data);

      if (text.length >= MIN_READABLE_PDF_TEXT_LENGTH) {
        materials.push({
          filename: upload.originalFilename,
          text,
          type: "pdf_text",
        });
      }
    } catch {
      continue;
    }
  }

  return materials;
}

export async function getTripExtractionMaterials(uploads: TripUpload[]) {
  const [notes, textFiles, pdfs] = await Promise.all([
    Promise.resolve(getNoteExtractionMaterials(uploads)),
    getTextFileExtractionMaterials(uploads),
    getPdfExtractionMaterials(uploads),
  ]);

  return [...notes, ...textFiles, ...pdfs].filter((material) =>
    material.text.trim()
  );
}
