import type { TripUpload } from "@/lib/uploads";

export const MAX_INITIAL_TEXT_FILE_BYTES = 250 * 1024;
export const MAX_INITIAL_PDF_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_INITIAL_OCR_FILE_BYTES = 10 * 1024 * 1024;

const ocrMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isInitialExtractionOcrCandidate(
  upload: Pick<TripUpload, "fileSizeBytes" | "fileType" | "storagePath">
) {
  return Boolean(
    upload.storagePath &&
      upload.fileType &&
      ocrMimeTypes.has(upload.fileType) &&
      Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_OCR_FILE_BYTES
  );
}

export function isInitialExtractionTextCandidate(
  upload: Pick<
    TripUpload,
    "fileSizeBytes" | "fileType" | "storagePath" | "userNote"
  >
) {
  if (upload.userNote?.trim()) {
    return true;
  }

  if (!upload.storagePath) {
    return false;
  }

  if (
    upload.fileType === "text/plain" &&
    Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_TEXT_FILE_BYTES
  ) {
    return true;
  }

  return (
    upload.fileType === "application/pdf" &&
    Number(upload.fileSizeBytes ?? 0) <= MAX_INITIAL_PDF_FILE_BYTES
  );
}

export function canSeedInitialExtraction(upload: TripUpload) {
  return (
    isInitialExtractionTextCandidate(upload) ||
    isInitialExtractionOcrCandidate(upload)
  );
}
