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

const [fileArg, modelArg] = process.argv.slice(2);
if (!fileArg) {
  console.error("usage: node scripts/ocr-smoke-test.mjs <file> [model]");
  process.exit(2);
}
if (modelArg) process.env.OPENAI_OCR_MODEL = modelArg;

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

const base64 = fs.readFileSync(filePath).toString("base64");
const started = process.hrtime.bigint();
let result;
try {
  result = await openaiModule.createOpenAIOcrText({
    base64,
    filename: path.basename(filePath),
    mimeType,
  });
} catch (error) {
  console.error(`\nOCR SMOKE TEST FAILED: ${error?.message ?? error}`);
  console.error(
    "A model that cannot read this file type fails HERE, for a fraction of a " +
      "cent, instead of costing a live run."
  );
  process.exit(1);
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

const text = result?.text ?? "";
console.log(`\nmodel reported: ${result?.model ?? "(none)"}`);
console.log(`pages         : ${(result?.pageNumbers ?? []).join(", ") || "(n/a)"}`);
console.log(`characters    : ${text.length}`);
console.log(`elapsed       : ${Math.round(elapsedMs)} ms`);
console.log(`\n--- first 400 characters ---\n${text.slice(0, 400)}`);

if (text.trim().length === 0) {
  console.error(
    "\nSMOKE TEST FAILED: zero characters extracted. This model cannot read " +
      "this file. Do NOT make it the OCR default."
  );
  process.exit(1);
}
console.log("\nSMOKE TEST PASSED: the model returned readable text.");
