import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TripUpload } from "@/lib/uploads";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";

const TRIP_MATERIALS_BUCKET = "trip-materials";
const MAX_TEXT_FILE_BYTES = 250 * 1024;

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

export async function getTripExtractionMaterials(uploads: TripUpload[]) {
  const [notes, textFiles] = await Promise.all([
    Promise.resolve(getNoteExtractionMaterials(uploads)),
    getTextFileExtractionMaterials(uploads),
  ]);

  return [...notes, ...textFiles].filter((material) => material.text.trim());
}
