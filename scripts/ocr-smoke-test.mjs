// Single-file OCR smoke test — the check AGENTS.md discipline 1(c) requires
// before any OCR model change, made cheap enough that skipping it is
// indefensible.
//
//   node scripts/ocr-smoke-test.mjs <file> [model]
//
// Examples:
//   node scripts/ocr-smoke-test.mjs "USE FOR TESTING CZECH.pdf"
//   node scripts/ocr-smoke-test.mjs page.png gpt-5.6-luna
//
// WHY THIS EXISTS. On 2026-07-25 the OCR default was changed to a TEXT-ONLY
// model on the basis of git history alone. OCR then extracted nothing, the
// source PDF was receipted as "not included", only the pdf.js text layer
// reached the parser, and a live run produced 6 transport / 4 activities
// instead of 8 / ~40. One page through this script would have shown 0
// characters and cost a fraction of a cent. Discipline 1(c) asked for exactly
// that smoke test and it was skipped because the reasoning felt strong.
//
// A model change is a MIGRATION, and the only evidence that a model can read a
// document is a document it has read. Run this, look at the character count,
// THEN change the default.
//
// Reads OPENAI_API_KEY (and the rest) from .env.local. This DOES spend money —
// one call on one file, deliberately the smallest possible spend.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// fileURLToPath, not URL.pathname: the repo path contains spaces.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const envPath = path.join(rootDir, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(rootDir, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

// usage: <file> [--model X] [--batch-pages N] [--all]
const argv = process.argv.slice(2);
let fileArg = null;
let modelArg = null;
let batchPagesArg = null;
let ocrAllPages = false;
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--model") modelArg = argv[++index];
  else if (arg === "--batch-pages") batchPagesArg = Number(argv[++index]);
  else if (arg === "--all") ocrAllPages = true;
  else if (!fileArg) fileArg = arg;
  else if (!modelArg) modelArg = arg; // positional model, back-compat
}
if (!fileArg) {
  console.error(
    "usage: node scripts/ocr-smoke-test.mjs <file> [--model X] " +
      "[--batch-pages N] [--all]\n\n" +
      "  --batch-pages N  pages per model call (production default 4, via\n" +
      "                   OPENAI_OCR_PDF_BATCH_PAGES). Asking one call to\n" +
      "                   transcribe several dense pages is a known cause of\n" +
      "                   OMITTED lines, so compare N=4 against N=1.\n" +
      "  --all            OCR every batch and report TOTAL characters, so the\n" +
      "                   number is directly comparable to a live run's\n" +
      "                   ocrSummary. Without it, only the FIRST batch runs.\n"
  );
  process.exit(2);
}
if (modelArg) process.env.OPENAI_OCR_MODEL = modelArg;
if (Number.isFinite(batchPagesArg) && batchPagesArg > 0) {
  process.env.OPENAI_OCR_PDF_BATCH_PAGES = String(Math.floor(batchPagesArg));
}

const filePath = path.isAbsolute(fileArg)
  ? fileArg
  : path.join(rootDir, fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`file not found: ${filePath}`);
  process.exit(2);
}

const require2 = Module.createRequire(import.meta.url);
const envModule = require2(path.join(rootDir, "lib/env.ts"));
const openaiModule = require2(path.join(rootDir, "lib/ai/openai.ts"));

const config = envModule.getOpenAIConfig();
const visionCapable = envModule.OCR_VISION_CAPABLE_MODELS ?? [];
const extension = path.extname(filePath).toLowerCase();
const mimeType =
  extension === ".pdf"
    ? "application/pdf"
    : extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : "image/jpeg";

console.log(`file    : ${path.basename(filePath)} (${mimeType})`);
console.log(`model   : ${config.ocrModel}`);
console.log(
  `allowlist: ${visionCapable.join(", ") || "(none)"}${
    visionCapable.includes(config.ocrModel)
      ? ""
      : "  <-- NOT on the vision allowlist; expect 0 characters"
  }`
);

const bytes = fs.readFileSync(filePath);

// Build the same page batches production builds, so a character count here is
// comparable to a live run's ocrSummary rather than a different measurement.
let batches;
if (mimeType === "application/pdf") {
  const batchModule = require2(
    path.join(rootDir, "lib/extraction/pdf-page-batches.ts")
  );
  const batcher = await batchModule.createPdfPageBatcher(
    new Uint8Array(bytes)
  );
  const pageGroups = batchModule.createPageNumberBatches({
    batchSize: config.ocrPdfBatchPages,
    pageCount: batcher.pageCount,
  });
  console.log(
    `pages     : ${batcher.pageCount} in ${pageGroups.length} batch(es) of ` +
      `${config.ocrPdfBatchPages} (OPENAI_OCR_PDF_BATCH_PAGES)`
  );
  const selected = ocrAllPages ? pageGroups : pageGroups.slice(0, 1);
  if (!ocrAllPages && pageGroups.length > 1) {
    console.log(
      `mode      : FIRST BATCH ONLY (pass --all for every batch and a total ` +
        `comparable to a live run)`
    );
  }
  batches = [];
  for (const pageNumbers of selected) {
    const batch = await batcher.createBatch(pageNumbers);
    batches.push({ base64: batch.base64, pageNumbers });
  }
} else {
  batches = [{ base64: bytes.toString("base64"), pageNumbers: [1] }];
}

let totalChars = 0;
let firstText = "";
let reportedModel = null;
const started = process.hrtime.bigint();
for (const batch of batches) {
  let result;
  try {
    result = await openaiModule.createOpenAIOcrText({
      base64: batch.base64,
      filename: path.basename(filePath),
      mimeType,
    });
  } catch (error) {
    console.error(
      `\nOCR SMOKE TEST FAILED on pages ${batch.pageNumbers.join(",")}: ` +
        `${error?.message ?? error}`
    );
    console.error(
      "A model that cannot read this file type fails HERE, for a fraction of " +
        "a cent, instead of costing a live run."
    );
    process.exit(1);
  }
  const text = result?.text ?? "";
  totalChars += text.length;
  if (!firstText) firstText = text;
  reportedModel = result?.model ?? reportedModel;
  console.log(
    `  pages ${String(batch.pageNumbers.join(",")).padEnd(12)} -> ` +
      `${String(text.length).padStart(6)} chars`
  );
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

const pagesRead = batches.reduce((sum, b) => sum + b.pageNumbers.length, 0);
console.log(`\nmodel reported : ${reportedModel ?? "(none)"}`);
console.log(`characters     : ${totalChars}`);
console.log(
  `chars per page : ${pagesRead ? Math.round(totalChars / pagesRead) : 0}` +
    `   <-- the number to COMPARE across models and batch sizes`
);
console.log(`elapsed        : ${Math.round(elapsedMs)} ms`);
console.log(`\n--- first 400 characters ---\n${firstText.slice(0, 400)}`);

if (totalChars === 0) {
  console.error(
    "\nSMOKE TEST FAILED: zero characters extracted. This model cannot read " +
      "this file. Do NOT make it the OCR default."
  );
  process.exit(1);
}
console.log("\nSMOKE TEST PASSED: the model returned readable text.");
console.log(
  "For a quality comparison, run the SAME file at --batch-pages 4 and " +
    "--batch-pages 1 and compare 'chars per page'. Run 7.25.0 averaged ~1,640 " +
    "chars/page at 4 pages per call (31,173 chars / 19 pages) and lost 41 of " +
    "399 source lines."
);
