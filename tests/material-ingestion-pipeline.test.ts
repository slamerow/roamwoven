import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type {
  MaterialExtractionCheckpointInput,
  MaterialExtractionRecord,
} from "@/lib/extraction/material-extractions";
import type { TripUpload } from "@/lib/uploads";

async function createDocxBuffer() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX stay: Hotel Josef, Prague</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`
  );
  return zip.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
}

async function createXlsxBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Vienna");
  sheet.addRow(["Date", "Plan"]);
  sheet.addRow(["2026-09-12", "XLSX plan: Schönbrunn Palace"]);
  const hidden = workbook.addWorksheet("Hidden");
  hidden.state = "hidden";
  hidden.addRow(["Do not ingest"]);
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

function upload({
  buffer,
  fileType,
  id,
  name,
}: {
  buffer: Buffer;
  fileType: string;
  id: string;
  name: string;
}): TripUpload {
  return {
    contentSha256: null,
    createdAt: "2026-07-15T00:00:00.000Z",
    fileSizeBytes: buffer.length,
    fileType,
    id,
    originalFilename: name,
    processingStatus: "uploaded",
    sourceKind: "file",
    storagePath: `trip/${name}`,
    tripId: "trip-office",
    userNote: null,
  };
}

export default async function run() {
  const docx = await createDocxBuffer();
  const xlsx = await createXlsxBuffer();
  const csv = Buffer.from("Date,Plan\n2026-09-13,CSV plan: Belvedere Palace\n");
  const corrupt = Buffer.from("not a docx archive");
  const fileByPath = new Map<string, Buffer>([
    ["trip/itinerary.docx", docx],
    ["trip/itinerary.xlsx", xlsx],
    ["trip/itinerary.csv", csv],
    ["trip/corrupt.docx", corrupt],
  ]);
  const uploads = [
    upload({
      buffer: docx,
      fileType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      id: "docx",
      name: "itinerary.docx",
    }),
    upload({
      buffer: xlsx,
      fileType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      id: "xlsx",
      name: "itinerary.xlsx",
    }),
    upload({
      buffer: csv,
      fileType: "text/csv",
      id: "csv",
      name: "itinerary.csv",
    }),
    upload({
      buffer: corrupt,
      fileType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      id: "corrupt",
      name: "corrupt.docx",
    }),
    upload({
      buffer: Buffer.alloc(100),
      fileType: "image/png",
      id: "failed-image",
      name: "screenshot.png",
    }),
  ];

  const adminModule = require("@/lib/supabase/admin") as {
    createSupabaseAdminClient: () => unknown;
  };
  const extractionModule = require("@/lib/extraction/material-extractions") as {
    listMaterialExtractionCheckpoints: (
      tripId: string
    ) => Promise<MaterialExtractionRecord[]>;
    upsertMaterialExtractionCheckpoint: (
      input: MaterialExtractionCheckpointInput
    ) => Promise<MaterialExtractionRecord>;
  };
  const originalAdmin = adminModule.createSupabaseAdminClient;
  const originalList = extractionModule.listMaterialExtractionCheckpoints;
  const originalUpsert = extractionModule.upsertMaterialExtractionCheckpoint;
  const checkpoints = new Map<string, MaterialExtractionRecord>();
  checkpoints.set("failed-image", {
    completedAt: "2026-07-15T00:00:00.000Z",
    createdAt: "2026-07-15T00:00:00.000Z",
    errorMessage: "OCR provider failed.",
    extractedCharCount: 0,
    extractionMethod: "ocr",
    failureClass: "openai_500",
    id: "checkpoint-failed-image",
    metadata: { ocrProvider: "test-ocr" },
    status: "failed",
    textContent: null,
    tripId: "trip-office",
    updatedAt: "2026-07-15T00:00:00.000Z",
    uploadId: "failed-image",
  });

  adminModule.createSupabaseAdminClient = () => ({
    storage: {
      from: () => ({
        download: async (storagePath: string) => {
          const buffer = fileByPath.get(storagePath);
          return buffer
            ? { data: new Blob([Uint8Array.from(buffer)]), error: null }
            : { data: null, error: { message: "missing fixture" } };
        },
      }),
    },
  });
  extractionModule.listMaterialExtractionCheckpoints = async () => [
    ...checkpoints.values(),
  ];
  extractionModule.upsertMaterialExtractionCheckpoint = async (input) => {
    const now = "2026-07-15T00:00:00.000Z";
    const record: MaterialExtractionRecord = {
      completedAt: input.status === "pending" ? null : now,
      createdAt: now,
      errorMessage: input.errorMessage ?? null,
      extractedCharCount:
        input.extractedCharCount ?? input.textContent?.length ?? 0,
      extractionMethod: input.extractionMethod ?? "triage",
      failureClass: input.failureClass ?? null,
      id: `checkpoint-${input.uploadId}`,
      metadata: input.metadata ?? {},
      status: input.status,
      textContent: input.textContent?.trim() || null,
      tripId: input.tripId,
      updatedAt: now,
      uploadId: input.uploadId,
    };
    checkpoints.set(input.uploadId, record);
    return record;
  };

  const tripMaterialsPath = require.resolve("@/lib/extraction/trip-materials");
  delete require.cache[tripMaterialsPath];

  try {
    const { getTripExtractionMaterialsWithSummary } = require(
      "@/lib/extraction/trip-materials"
    ) as typeof import("@/lib/extraction/trip-materials");
    const result = await getTripExtractionMaterialsWithSummary(uploads, {
      retryFailedOcr: false,
    });
    const combined = result.materials.map((material) => material.text).join("\n");

    assert.equal(result.materials.length, 3);
    assert.match(combined, /DOCX stay: Hotel Josef/);
    assert.match(combined, /XLSX plan: Schönbrunn Palace/);
    assert.match(combined, /CSV plan: Belvedere Palace/);
    assert.doesNotMatch(combined, /Do not ingest/);
    assert.equal(checkpoints.get("docx")?.status, "text_ready");
    assert.equal(checkpoints.get("xlsx")?.status, "text_ready");
    assert.equal(checkpoints.get("csv")?.status, "text_ready");
    assert.equal(checkpoints.get("corrupt")?.status, "failed");
    assert.equal(checkpoints.get("failed-image")?.status, "failed");
    assert.equal(
      checkpoints.get("corrupt")?.failureClass,
      "office_invalid_archive"
    );
  } finally {
    adminModule.createSupabaseAdminClient = originalAdmin;
    extractionModule.listMaterialExtractionCheckpoints = originalList;
    extractionModule.upsertMaterialExtractionCheckpoint = originalUpsert;
    delete require.cache[tripMaterialsPath];
  }
}
