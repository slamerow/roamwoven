// Bounded paid smoke for the one prompt sentence corrected on 2026-08-05.
//
//   node scripts/smoke-disjunction-source-boundary.mjs          # no network
//   node scripts/smoke-disjunction-source-boundary.mjs --live   # paid provider call
//
// Uses the real trip-spine + one-activity-chunk extraction path with synthetic
// text only. It never reads the Central Europe PDF, writes the database, or
// enables geocoding. Expected primary request count: two (spine + one chunk).

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");

if (!live) {
  console.log(
    "DRY RUN: would make the real gpt-5.4-mini spine + one-chunk extraction calls " +
      "using synthetic adjacent-lines and explicit-or controls. Re-run with --live after approval."
  );
  process.exit(0);
}

const envPath = path.join(rootDir, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}

assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required for --live");
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
process.env.OPENAI_EXTRACTION_MODEL = "gpt-5.4-mini";
process.env.OPENAI_RECOVERY_MODEL = "gpt-5.4-mini";
delete process.env.GEOCODE_VERIFICATION_API_KEY;

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
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const require2 = Module.createRequire(import.meta.url);
const parser = require2(
  path.join(rootDir, "lib/extraction/openai-trip-parser.ts")
);

const syntheticText = [
  "Test City ideas",
  "Modern Art Museum",
  "Design Museum",
  "",
  "Monday, September 14, 2026",
  "12:00 Lunch at Cafe Meridian or Cafe Juniper",
].join("\n");

const result = await parser.extractTripDraftWithOpenAI({
  materials: [
    {
      filename: "synthetic-disjunction-smoke.txt",
      sourceProvenance: "synthetic",
      sourceUploadId: "synthetic-disjunction-smoke",
      text: syntheticText,
      type: "text",
    },
  ],
  tripName: "Synthetic disjunction boundary smoke",
});

const observations = result.evidenceArtifacts.observations.filter(
  (observation) => observation.source === "model_chunk"
);
const observationTexts = observations.map((observation) =>
  JSON.stringify(observation.payload).toLowerCase()
);
const allObservationText = observationTexts.join("\n");

assert.equal(result.model, "gpt-5.4-mini", "the smoke must not change models");
assert.equal(result.usage.activityChunks.count, 1, "expected one activity chunk");
assert.equal(result.usage.activityChunks.failed, 0, "the activity chunk must succeed");
assert.match(allObservationText, /modern art museum/);
assert.match(allObservationText, /design museum/);
assert.doesNotMatch(
  allObservationText,
  /modern art museum.{0,40}\bor\b.{0,40}design museum|design museum.{0,40}\bor\b.{0,40}modern art museum/,
  "adjacent source lines without `or` must not become one invented choice"
);
assert.ok(
  observationTexts.some(
    (text) =>
      /cafe meridian/.test(text) &&
      /cafe juniper/.test(text) &&
      /\bor\b/.test(text)
  ),
  "the explicit source alternative must remain one X-or-Y observation"
);

console.log(
  JSON.stringify(
    {
      activityChunks: result.usage.activityChunks,
      liveCallCount: result.usage.extractionSampling?.liveCallCount ?? null,
      model: result.model,
      observationCount: observations.length,
      result: "PASS",
      sourceRecoveryOutcome: result.usage.sourceRecovery?.outcome ?? null,
    },
    null,
    2
  )
);
