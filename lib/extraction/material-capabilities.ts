export const MAX_INITIAL_TEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_INITIAL_PDF_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_INITIAL_OCR_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_INITIAL_OFFICE_FILE_BYTES = 25 * 1024 * 1024;

export type MaterialCapabilityKind =
  | "csv"
  | "docx"
  | "image"
  | "pdf"
  | "text"
  | "xlsx";

export type MaterialCapability = {
  extension: string;
  kind: MaterialCapabilityKind;
  maxFileBytes: number;
  mimeType: string;
};

const capabilities: MaterialCapability[] = [
  {
    extension: "pdf",
    kind: "pdf",
    maxFileBytes: MAX_INITIAL_PDF_FILE_BYTES,
    mimeType: "application/pdf",
  },
  {
    extension: "txt",
    kind: "text",
    maxFileBytes: MAX_INITIAL_TEXT_FILE_BYTES,
    mimeType: "text/plain",
  },
  {
    extension: "csv",
    kind: "csv",
    maxFileBytes: MAX_INITIAL_TEXT_FILE_BYTES,
    mimeType: "text/csv",
  },
  {
    extension: "docx",
    kind: "docx",
    maxFileBytes: MAX_INITIAL_OFFICE_FILE_BYTES,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    extension: "xlsx",
    kind: "xlsx",
    maxFileBytes: MAX_INITIAL_OFFICE_FILE_BYTES,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    extension: "jpg",
    kind: "image",
    maxFileBytes: MAX_INITIAL_OCR_FILE_BYTES,
    mimeType: "image/jpeg",
  },
  {
    extension: "jpeg",
    kind: "image",
    maxFileBytes: MAX_INITIAL_OCR_FILE_BYTES,
    mimeType: "image/jpeg",
  },
  {
    extension: "png",
    kind: "image",
    maxFileBytes: MAX_INITIAL_OCR_FILE_BYTES,
    mimeType: "image/png",
  },
  {
    extension: "webp",
    kind: "image",
    maxFileBytes: MAX_INITIAL_OCR_FILE_BYTES,
    mimeType: "image/webp",
  },
];

const capabilityByExtension = new Map(
  capabilities.map((capability) => [capability.extension, capability])
);

export const ACCEPTED_MATERIAL_EXTENSIONS = capabilities.map(
  (capability) => capability.extension
);

export const ACCEPTED_MATERIAL_INPUT_ACCEPT = ACCEPTED_MATERIAL_EXTENSIONS.map(
  (extension) => `.${extension}`
).join(",");

type MaterialCapabilityInput = {
  fileSizeBytes?: number | null;
  fileType?: string | null;
  originalFilename?: string | null;
  storagePath?: string | null;
  userNote?: string | null;
};

export function getMaterialExtension(filename: string | null | undefined) {
  const normalized = filename?.trim().toLowerCase() ?? "";
  const separatorIndex = normalized.lastIndexOf(".");

  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : "";
}

export function getMaterialCapability(
  filename: string | null | undefined
): MaterialCapability | null {
  return capabilityByExtension.get(getMaterialExtension(filename)) ?? null;
}

export function getCanonicalMaterialMimeType(
  filename: string | null | undefined
) {
  return getMaterialCapability(filename)?.mimeType ?? null;
}

export function isAcceptedMaterialFilename(
  filename: string | null | undefined
) {
  return Boolean(getMaterialCapability(filename));
}

export function isMaterialWithinAcceptedSize(
  input: Pick<MaterialCapabilityInput, "fileSizeBytes" | "originalFilename">
) {
  const capability = getMaterialCapability(input.originalFilename);

  return Boolean(
    capability &&
      Number(input.fileSizeBytes ?? 0) > 0 &&
      Number(input.fileSizeBytes ?? 0) <= capability.maxFileBytes
  );
}

export function isInitialExtractionOcrCandidate(
  upload: MaterialCapabilityInput
) {
  const capability = getMaterialCapability(upload.originalFilename);

  return Boolean(
    upload.storagePath &&
      capability &&
      (capability.kind === "image" || capability.kind === "pdf") &&
      isMaterialWithinAcceptedSize(upload)
  );
}

export function isInitialExtractionTextCandidate(
  upload: MaterialCapabilityInput
) {
  if (upload.userNote?.trim()) {
    return true;
  }

  const capability = getMaterialCapability(upload.originalFilename);

  return Boolean(
    upload.storagePath &&
      capability &&
      capability.kind !== "image" &&
      isMaterialWithinAcceptedSize(upload)
  );
}

export function canSeedInitialExtraction(upload: MaterialCapabilityInput) {
  return (
    isInitialExtractionTextCandidate(upload) ||
    isInitialExtractionOcrCandidate(upload)
  );
}
