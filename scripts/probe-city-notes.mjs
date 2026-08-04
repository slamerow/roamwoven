// Diagnostic probe for the City Note lane, offline.
//
//   node scripts/probe-city-notes.mjs [.assembly-cache]
//
// Answers ONE question the scorecard cannot: when a record is demoted to a
// city note and then does not appear in the note that ships, WHERE does it
// die? The scorecard reads the final records, so it can only say "gone". This
// walks the layers underneath — the evidence piece, its city/kind/role, the
// note-collection piece, and the rendered note record — and prints the first
// layer at which a named token disappears.
//
// AGENTS.md rule 7(b): check the layer BELOW before attributing a defect.
// Written 2026-08-04 after a fix to the demotion lane moved nothing, which
// means the loss is somewhere else and guessing again would be the third
// wrong attribution in this class.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.resolve(process.argv[2] ?? ".assembly-cache");
const TOKENS = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["r2d2", "stephen", "ferris", "studel", "schonbrunn visit", "prater", "mozarthaus"];

process.env.OPENAI_API_KEY = "probe-must-not-call-the-network";
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
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

const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(cacheDir, name), "utf8"));
const parse = readJson("parse.json");
const calls = readJson("calls.json");
const materials = readJson("materials.json");
const trip = readJson("trip.json");

const pinning = require2(path.join(rootDir, "lib/extraction/extraction-pinning.ts"));
const parser = require2(path.join(rootDir, "lib/extraction/openai-trip-parser.ts"));
const cache = pinning.createExtractionParseCache(calls.calls_json ?? calls);
const result = await pinning.runWithExtractionParseCache(cache, () =>
  parser.extractTripDraftWithOpenAI({
    materials: materials.materials ?? materials,
    tripName: trip.name,
  })
);
if (cache.misses > 0) {
  console.error(`PROBE ABORT: ${cache.misses} pinned call(s) missed.`);
  process.exit(1);
}

const assemblyModule = require2(
  path.join(rootDir, "lib/extraction/canonical-trip-assembly.ts")
);
const prepared = assemblyModule.prepareCanonicalEvidencePieces(
  result.evidenceArtifacts.pieces
);
const assembly = assemblyModule.assembleCanonicalTripDraft({
  draft: result.draft,
  evidencePieces: prepared.pieces,
  fallbackTripName: trip.name,
  priorRecoveryActions: prepared.recoveryActions,
  tripId: trip.id ?? parse.trip_id,
});

const norm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const pieces = prepared.pieces;
const items = assembly.records.items;
const notesShipped = items.filter(
  (i) => i.itemType === "note" && i.status !== "ignored"
);

console.log(`\n=== NOTE RECORDS THAT SHIPPED (${notesShipped.length}) ===`);
for (const n of notesShipped) {
  console.log(`\n• "${n.title}"  date=${n.date}  len=${(n.description ?? "").length}`);
  console.log(`  ${(n.description ?? "").slice(0, 700)}`);
}

console.log(`\n\n=== NOTE-KIND EVIDENCE PIECES (before rendering) ===`);
const notePieces = pieces.filter((p) => p.kind === "note");
console.log(`${notePieces.length} note pieces; ${notePieces.filter((p) => p.outputEligible).length} eligible`);
for (const p of notePieces.filter((p) => p.outputEligible)) {
  console.log(
    `  [eligible] "${p.payload.title}" city=${JSON.stringify(p.payload.city)} date=${JSON.stringify(p.payload.date)} role=${p.role} len=${String(p.payload.description ?? "").length}`
  );
}

console.log(`\n\n=== WHERE EACH TOKEN DIES ===`);
for (const token of TOKENS) {
  const t = norm(token);
  const inAnyPiece = pieces.filter(
    (p) => norm(p.payload.title).includes(t) || norm(p.payload.description).includes(t)
  );
  const eligiblePiece = inAnyPiece.filter((p) => p.outputEligible);
  const inNotePieceText = notePieces.filter(
    (p) =>
      p.outputEligible &&
      (norm(p.payload.title).includes(t) || norm(p.payload.description).includes(t))
  );
  const inShippedNote = notesShipped.filter(
    (n) => norm(n.title).includes(t) || norm(n.description).includes(t)
  );
  const asCard = items.filter(
    (i) => i.itemType !== "note" && i.status !== "ignored" && norm(i.title).includes(t)
  );
  console.log(
    `\n${token}: pieces=${inAnyPiece.length} eligible=${eligiblePiece.length} inEligibleNoteText=${inNotePieceText.length} inShippedNote=${inShippedNote.length} asCard=${asCard.length}`
  );
  for (const p of inAnyPiece.slice(0, 3)) {
    console.log(
      `   piece "${p.payload.title}" kind=${p.kind} role=${p.role} eligible=${p.outputEligible} city=${JSON.stringify(p.payload.city)} date=${JSON.stringify(p.payload.date)}`
    );
    console.log(
      `      disposition=${JSON.stringify(p.disposition ?? null)} lastReasons=${JSON.stringify((p.actions ?? []).slice(-2).map((a) => `${a.type}: ${(a.reason ?? "").slice(0, 70)}`))}`
    );
  }
}
