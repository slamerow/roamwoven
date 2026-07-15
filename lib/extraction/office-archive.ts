import { fromBufferPromise } from "yauzl";
import { MaterialParserError } from "@/lib/extraction/material-parser-errors";

const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ARCHIVE_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSION_RATIO = 500;
const MIN_RATIO_CHECK_BYTES = 1024 * 1024;

export type OfficeArchiveSummary = {
  entryCount: number;
  macroPartCount: number;
  mediaBytes: number;
  mediaCount: number;
  uncompressedBytes: number;
};

function hasCompoundFileSignature(buffer: Buffer) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

  return signature.every((byte, index) => buffer[index] === byte);
}

function isUnsafeArchivePath(fileName: string) {
  return (
    fileName.startsWith("/") ||
    fileName.startsWith("\\") ||
    fileName.split(/[\\/]/).includes("..")
  );
}

export async function inspectOfficeArchive({
  buffer,
  expectedRoot,
}: {
  buffer: Buffer;
  expectedRoot: "word" | "xl";
}): Promise<OfficeArchiveSummary> {
  if (hasCompoundFileSignature(buffer)) {
    throw new MaterialParserError(
      "This Office file is encrypted, password-protected, or uses a legacy binary format.",
      "office_encrypted_or_legacy"
    );
  }

  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new MaterialParserError(
      "This Office file is corrupt or is not a valid DOCX/XLSX archive.",
      "office_invalid_archive"
    );
  }

  let archive;

  try {
    archive = await fromBufferPromise(buffer, {
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch (error) {
    throw new MaterialParserError(
      error instanceof Error
        ? `This Office file could not be opened safely: ${error.message}`
        : "This Office file could not be opened safely.",
      "office_invalid_archive"
    );
  }

  let entryCount = 0;
  let macroPartCount = 0;
  let mediaBytes = 0;
  let mediaCount = 0;
  let uncompressedBytes = 0;
  let hasContentTypes = false;
  let hasExpectedRoot = false;

  try {
    for await (const entry of archive.eachEntry()) {
      entryCount += 1;
      uncompressedBytes += entry.uncompressedSize;
      hasContentTypes ||= entry.fileName === "[Content_Types].xml";
      hasExpectedRoot ||= entry.fileName.startsWith(`${expectedRoot}/`);

      if (isUnsafeArchivePath(entry.fileName)) {
        throw new MaterialParserError(
          "This Office file contains an unsafe archive path.",
          "office_unsafe_archive_path"
        );
      }

      if (entry.isEncrypted()) {
        throw new MaterialParserError(
          "Password-protected Office files are not supported.",
          "office_encrypted_or_legacy"
        );
      }

      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        throw new MaterialParserError(
          "This Office file contains too many internal parts to process safely.",
          "office_archive_limit_exceeded",
          { entryCount, maxArchiveEntries: MAX_ARCHIVE_ENTRIES }
        );
      }

      if (entry.uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) {
        throw new MaterialParserError(
          "This Office file contains an oversized internal part.",
          "office_archive_limit_exceeded",
          {
            entryName: entry.fileName,
            entryUncompressedBytes: entry.uncompressedSize,
            maxArchiveEntryBytes: MAX_ARCHIVE_ENTRY_BYTES,
          }
        );
      }

      if (uncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
        throw new MaterialParserError(
          "This Office file expands beyond the safe processing limit.",
          "office_archive_limit_exceeded",
          {
            maxArchiveUncompressedBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
            uncompressedBytes,
          }
        );
      }

      const ratio =
        entry.compressedSize > 0
          ? entry.uncompressedSize / entry.compressedSize
          : entry.uncompressedSize > 0
            ? Number.POSITIVE_INFINITY
            : 0;

      if (
        entry.uncompressedSize >= MIN_RATIO_CHECK_BYTES &&
        ratio > MAX_ARCHIVE_COMPRESSION_RATIO
      ) {
        throw new MaterialParserError(
          "This Office file has an unsafe compression ratio.",
          "office_archive_limit_exceeded",
          {
            compressionRatio: ratio,
            entryName: entry.fileName,
            maxArchiveCompressionRatio: MAX_ARCHIVE_COMPRESSION_RATIO,
          }
        );
      }

      if (/vbaProject\.bin$/i.test(entry.fileName)) {
        macroPartCount += 1;
      }

      if (entry.fileName.startsWith(`${expectedRoot}/media/`)) {
        mediaCount += 1;
        mediaBytes += entry.uncompressedSize;
      }
    }
  } finally {
    archive.close();
  }

  if (!hasContentTypes || !hasExpectedRoot) {
    throw new MaterialParserError(
      `This file is not a valid ${expectedRoot === "word" ? "DOCX" : "XLSX"} document.`,
      "office_invalid_archive"
    );
  }

  if (macroPartCount > 0) {
    throw new MaterialParserError(
      "Macro-enabled Office files are not supported.",
      "office_macros_not_supported",
      { macroPartCount }
    );
  }

  return {
    entryCount,
    macroPartCount,
    mediaBytes,
    mediaCount,
    uncompressedBytes,
  };
}
