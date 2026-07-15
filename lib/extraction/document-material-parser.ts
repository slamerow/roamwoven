import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { parse as parseCsv } from "csv-parse/sync";
import { createOpenAIOcrText } from "@/lib/ai/openai";
import { MaterialParserError } from "@/lib/extraction/material-parser-errors";
import {
  inspectOfficeArchive,
  type OfficeArchiveSummary,
} from "@/lib/extraction/office-archive";

const MAX_PARSED_MATERIAL_TEXT_CHARS = 1_900_000;
const MAX_WORKBOOK_VISIBLE_CELLS = 100_000;
const MAX_CSV_RECORDS = 50_000;
const MAX_EMBEDDED_IMAGES_TO_OCR = 12;
const MAX_EMBEDDED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
const MIN_EMBEDDED_IMAGE_OCR_BYTES = 8 * 1024;
const EMBEDDED_IMAGE_OCR_CONCURRENCY = 2;

export type EmbeddedMaterialImage = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export type EmbeddedImageOcr = (
  image: EmbeddedMaterialImage
) => Promise<
  | string
  | {
      model?: string;
      text: string;
      usage?: unknown;
    }
>;

export type ParsedMaterialResult = {
  metadata: Record<string, unknown>;
  text: string;
};

type EmbeddedImageOcrSummary = {
  completedCount: number;
  failedCount: number;
  models: string[];
  skippedCount: number;
  textSections: string[];
  usage: unknown[];
};

type MammothMarkdown = typeof mammoth & {
  convertToMarkdown: (
    input: { buffer: Buffer },
    options?: Parameters<typeof mammoth.convertToHtml>[1]
  ) => ReturnType<typeof mammoth.convertToHtml>;
};

function ensureTextWithinCheckpointLimit(text: string) {
  if (text.length > MAX_PARSED_MATERIAL_TEXT_CHARS) {
    throw new MaterialParserError(
      "This document contains more visible text than one material can safely process.",
      "material_text_limit_exceeded",
      {
        extractedCharCount: text.length,
        maxParsedMaterialTextChars: MAX_PARSED_MATERIAL_TEXT_CHARS,
      }
    );
  }

  return text;
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/!\[[^\]]*\]\(embedded-image-(\d+)\)/g, "[Embedded image $1]")
    .replace(/<a id="[^"]+"><\/a>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function extensionToImageMimeType(extension: string | undefined) {
  switch (extension?.toLowerCase()) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

function isSupportedEmbeddedImage(image: EmbeddedMaterialImage) {
  return (
    image.mimeType === "image/jpeg" ||
    image.mimeType === "image/png" ||
    image.mimeType === "image/webp"
  );
}

async function defaultEmbeddedImageOcr(image: EmbeddedMaterialImage) {
  const result = await createOpenAIOcrText({
    base64: image.buffer.toString("base64"),
    filename: image.filename,
    mimeType: image.mimeType,
  });

  return {
    model: result.model,
    text: result.text,
    usage: result.usage,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index], index);
      }
    })
  );

  return results;
}

async function ocrEmbeddedImages({
  images,
  ocrImage,
}: {
  images: EmbeddedMaterialImage[];
  ocrImage: EmbeddedImageOcr;
}): Promise<EmbeddedImageOcrSummary> {
  let selectedBytes = 0;
  let skippedCount = 0;
  const selected: EmbeddedMaterialImage[] = [];

  for (const image of images) {
    const imageBytes = image.buffer.length;
    const withinLimits =
      isSupportedEmbeddedImage(image) &&
      imageBytes >= MIN_EMBEDDED_IMAGE_OCR_BYTES &&
      imageBytes <= MAX_EMBEDDED_IMAGE_BYTES &&
      selected.length < MAX_EMBEDDED_IMAGES_TO_OCR &&
      selectedBytes + imageBytes <= MAX_EMBEDDED_IMAGE_TOTAL_BYTES;

    if (!withinLimits) {
      skippedCount += 1;
      continue;
    }

    selected.push(image);
    selectedBytes += imageBytes;
  }

  const results = await mapWithConcurrency(
    selected,
    EMBEDDED_IMAGE_OCR_CONCURRENCY,
    async (image, index) => {
      try {
        const output = await ocrImage(image);
        const text = (typeof output === "string" ? output : output.text).trim();
        return text
          ? {
              model: typeof output === "string" ? null : output.model ?? null,
              status: "completed" as const,
              text: `[Embedded image ${index + 1}: ${image.filename}]\n${text}`,
              usage: typeof output === "string" ? null : output.usage ?? null,
            }
          : { model: null, status: "failed" as const, text: "", usage: null };
      } catch {
        return { model: null, status: "failed" as const, text: "", usage: null };
      }
    }
  );

  return {
    completedCount: results.filter((result) => result.status === "completed")
      .length,
    failedCount: results.filter((result) => result.status === "failed").length,
    models: Array.from(
      new Set(
        results
          .map((result) => result.model)
          .filter((model): model is string => Boolean(model))
      )
    ),
    skippedCount,
    textSections: results
      .map((result) => result.text)
      .filter((text): text is string => Boolean(text)),
    usage: results
      .map((result) => result.usage)
      .filter((usage) => usage !== null && usage !== undefined),
  };
}

function addEmbeddedImageText(text: string, sections: string[]) {
  if (sections.length === 0) {
    return text;
  }

  return [text, "Embedded image text", ...sections].filter(Boolean).join("\n\n");
}

function archiveMetadata(summary: OfficeArchiveSummary) {
  return {
    archiveEntryCount: summary.entryCount,
    archiveUncompressedBytes: summary.uncompressedBytes,
    embeddedImageArchiveBytes: summary.mediaBytes,
    embeddedImageArchiveCount: summary.mediaCount,
  };
}

export async function extractDocxMaterial({
  buffer,
  filename,
  ocrImage = defaultEmbeddedImageOcr,
}: {
  buffer: Buffer;
  filename: string;
  ocrImage?: EmbeddedImageOcr;
}): Promise<ParsedMaterialResult> {
  const archive = await inspectOfficeArchive({ buffer, expectedRoot: "word" });
  const images: EmbeddedMaterialImage[] = [];
  const imageConverter = mammoth.images.imgElement(async (image) => {
    const index = images.length + 1;
    images.push({
      buffer: await image.readAsBuffer(),
      filename: `${filename} embedded image ${index}`,
      mimeType: image.contentType,
    });
    return { src: `embedded-image-${index}` };
  });
  const converter = mammoth as MammothMarkdown;
  let converted;

  try {
    converted = await converter.convertToMarkdown(
      { buffer },
      {
        convertImage: imageConverter,
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        styleMap: ["comment-reference => sup"],
      }
    );
  } catch (error) {
    throw new MaterialParserError(
      error instanceof Error
        ? `This DOCX could not be read: ${error.message}`
        : "This DOCX could not be read.",
      "docx_parse_failed"
    );
  }

  const imageOcr = await ocrEmbeddedImages({ images, ocrImage });
  const text = ensureTextWithinCheckpointLimit(
    normalizeExtractedText(
      addEmbeddedImageText(converted.value, imageOcr.textSections)
    )
  );

  return {
    metadata: {
      ...archiveMetadata(archive),
      embeddedImageCount: images.length,
      embeddedImageOcrCompletedCount: imageOcr.completedCount,
      embeddedImageOcrFailedCount: imageOcr.failedCount,
      embeddedImageOcrModels: imageOcr.models,
      embeddedImageOcrSkippedCount: imageOcr.skippedCount,
      embeddedImageOcrUsage: imageOcr.usage,
      parserMessageCount: converted.messages.length,
      trackedChangesPolicy: "insertions_included_deletions_ignored",
    },
    text,
  };
}

function formatDate(value: Date) {
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

function formatExcelValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if ("richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }

  if ("hyperlink" in value) {
    const label = value.text?.trim() || value.hyperlink;
    return label === value.hyperlink ? label : `${label} <${value.hyperlink}>`;
  }

  if ("formula" in value || "sharedFormula" in value) {
    if (value.result instanceof Date) {
      return formatDate(value.result);
    }

    if (
      typeof value.result === "string" ||
      typeof value.result === "number" ||
      typeof value.result === "boolean"
    ) {
      return String(value.result);
    }

    if (value.result && "error" in value.result) {
      return value.result.error;
    }

    return "[displayed formula result unavailable]";
  }

  if ("error" in value) {
    return value.error;
  }

  return "";
}

function formatExcelComment(note: ExcelJS.Cell["note"]) {
  if (typeof note === "string") {
    return note.trim();
  }

  return note?.texts?.map((part) => part.text).join("").trim() ?? "";
}

function isImageAnchorVisible(worksheet: ExcelJS.Worksheet, row: number, col: number) {
  return !worksheet.getRow(row + 1).hidden && !worksheet.getColumn(col + 1).hidden;
}

export async function extractXlsxMaterial({
  buffer,
  filename,
  ocrImage = defaultEmbeddedImageOcr,
}: {
  buffer: Buffer;
  filename: string;
  ocrImage?: EmbeddedImageOcr;
}): Promise<ParsedMaterialResult> {
  const archive = await inspectOfficeArchive({ buffer, expectedRoot: "xl" });
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  } catch (error) {
    throw new MaterialParserError(
      error instanceof Error
        ? `This XLSX could not be read: ${error.message}`
        : "This XLSX could not be read.",
      "xlsx_parse_failed"
    );
  }

  const sections: string[] = [];
  const images: EmbeddedMaterialImage[] = [];
  let commentCount = 0;
  let formulaWithoutResultCount = 0;
  let hiddenColumnCount = 0;
  let hiddenRowCount = 0;
  let hiddenSheetCount = 0;
  let visibleCellCount = 0;
  let visibleSheetCount = 0;

  workbook.eachSheet((worksheet) => {
    if (worksheet.state !== "visible") {
      hiddenSheetCount += 1;
      return;
    }

    visibleSheetCount += 1;
    const sheetLines = [`# Sheet: ${worksheet.name}`];
    const merges = worksheet.model.merges ?? [];

    if (merges.length > 0) {
      sheetLines.push(`Merged cells: ${merges.join(", ")}`);
    }

    worksheet.columns.forEach((column) => {
      if (column.hidden) {
        hiddenColumnCount += 1;
      }
    });

    worksheet.eachRow((row) => {
      if (row.hidden) {
        hiddenRowCount += 1;
        return;
      }

      const cells: string[] = [];

      row.eachCell({ includeEmpty: false }, (cell) => {
        if (worksheet.getColumn(cell.col).hidden) {
          return;
        }

        if (cell.isMerged && cell.master.address !== cell.address) {
          return;
        }

        visibleCellCount += 1;

        if (visibleCellCount > MAX_WORKBOOK_VISIBLE_CELLS) {
          throw new MaterialParserError(
            "This workbook contains too many visible cells to process safely.",
            "workbook_cell_limit_exceeded",
            {
              maxWorkbookVisibleCells: MAX_WORKBOOK_VISIBLE_CELLS,
              visibleCellCount,
            }
          );
        }

        const value = formatExcelValue(cell.value);
        const comment = formatExcelComment(cell.note);

        if (
          cell.value &&
          typeof cell.value === "object" &&
          ("formula" in cell.value || "sharedFormula" in cell.value) &&
          !value.replace("[displayed formula result unavailable]", "")
        ) {
          formulaWithoutResultCount += 1;
        }

        if (value) {
          cells.push(`${cell.address}: ${value}`);
        }

        if (comment) {
          commentCount += 1;
          cells.push(`${cell.address} comment: ${comment}`);
        }
      });

      if (cells.length > 0) {
        sheetLines.push(`Row ${row.number} | ${cells.join(" | ")}`);
      }
    });

    for (const worksheetImage of worksheet.getImages()) {
      if (
        !isImageAnchorVisible(
          worksheet,
          worksheetImage.range.tl.nativeRow,
          worksheetImage.range.tl.nativeCol
        )
      ) {
        continue;
      }

      const image = workbook.getImage(Number(worksheetImage.imageId));
      const mimeType = extensionToImageMimeType(image?.extension);

      if (image?.buffer && mimeType) {
        images.push({
          buffer: Buffer.from(image.buffer),
          filename: `${filename} ${worksheet.name} image ${images.length + 1}`,
          mimeType,
        });
      }
    }

    const backgroundImageId = worksheet.getBackgroundImageId();

    if (backgroundImageId) {
      const image = workbook.getImage(Number(backgroundImageId));
      const mimeType = extensionToImageMimeType(image?.extension);

      if (image?.buffer && mimeType) {
        images.push({
          buffer: Buffer.from(image.buffer),
          filename: `${filename} ${worksheet.name} background image`,
          mimeType,
        });
      }
    }

    sections.push(sheetLines.join("\n"));
  });

  const imageOcr = await ocrEmbeddedImages({ images, ocrImage });
  const text = ensureTextWithinCheckpointLimit(
    normalizeExtractedText(
      addEmbeddedImageText(sections.join("\n\n"), imageOcr.textSections)
    )
  );

  return {
    metadata: {
      ...archiveMetadata(archive),
      commentCount,
      embeddedImageCount: images.length,
      embeddedImageOcrCompletedCount: imageOcr.completedCount,
      embeddedImageOcrFailedCount: imageOcr.failedCount,
      embeddedImageOcrModels: imageOcr.models,
      embeddedImageOcrSkippedCount: imageOcr.skippedCount,
      embeddedImageOcrUsage: imageOcr.usage,
      formulaExecutionPolicy: "cached_display_results_only",
      formulaWithoutResultCount,
      hiddenColumnCount,
      hiddenRowCount,
      hiddenSheetCount,
      visibleCellCount,
      visibleSheetCount,
    },
    text,
  };
}

function spreadsheetColumnLabel(index: number) {
  let label = "";
  let remaining = index + 1;

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    label = String.fromCharCode(65 + offset) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
}

export function extractCsvMaterial({
  buffer,
  filename,
}: {
  buffer: Buffer;
  filename: string;
}): ParsedMaterialResult {
  let records: string[][];

  try {
    records = parseCsv(buffer, {
      bom: true,
      cast: false,
      columns: false,
      max_record_size: 1_000_000,
      relax_column_count: true,
      skip_empty_lines: false,
      to: MAX_CSV_RECORDS + 1,
    }) as string[][];
  } catch (error) {
    throw new MaterialParserError(
      error instanceof Error
        ? `This CSV could not be read: ${error.message}`
        : "This CSV could not be read.",
      "csv_parse_failed"
    );
  }

  if (records.length > MAX_CSV_RECORDS) {
    throw new MaterialParserError(
      "This CSV contains too many rows to process safely.",
      "csv_record_limit_exceeded",
      { maxCsvRecords: MAX_CSV_RECORDS, recordCount: records.length }
    );
  }

  const lines = [`# Sheet: ${filename}`];
  let visibleCellCount = 0;

  records.forEach((record, rowIndex) => {
    const cells = record
      .map((value, columnIndex) => {
        const normalized = String(value ?? "").trim();

        if (!normalized) {
          return null;
        }

        visibleCellCount += 1;
        return `${spreadsheetColumnLabel(columnIndex)}${rowIndex + 1}: ${normalized}`;
      })
      .filter((value): value is string => Boolean(value));

    if (cells.length > 0) {
      lines.push(`Row ${rowIndex + 1} | ${cells.join(" | ")}`);
    }
  });

  const text = ensureTextWithinCheckpointLimit(normalizeExtractedText(lines.join("\n")));

  return {
    metadata: {
      formulaExecutionPolicy: "never_execute",
      recordCount: records.length,
      visibleCellCount,
    },
    text,
  };
}
