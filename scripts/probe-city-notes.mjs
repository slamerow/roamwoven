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
const geocodeSeed = readJson("geocode.json");
const materials = readJson("materials.json");
const trip = readJson("trip.json");

const pinning = require2(path.join(rootDir, "lib/extraction/extraction-pinning.ts"));
const geocode = require2(
  path.join(rootDir, "lib/extraction/geocode-verification.ts")
);
const parser = require2(path.join(rootDir, "lib/extraction/openai-trip-parser.ts"));
const cache = pinning.createExtractionParseCache(calls.calls_json ?? calls);
const geocodeReplay = geocode.createGeocodeVerificationReplayCache(geocodeSeed);
const result = await pinning.runWithExtractionParseCache(cache, () =>
  geocode.runWithGeocodeVerificationReplay(geocodeReplay, () =>
    parser.extractTripDraftWithOpenAI({
      materials: materials.materials ?? materials,
      tripName: trip.name,
    })
  )
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
const preparedPiecesBeforeAssembly = structuredClone(prepared.pieces);
const corridorModule = require2(
  path.join(rootDir, "lib/extraction/canonical-assembly-quality-corridor.ts")
);
const corridor = corridorModule.runCanonicalAssemblyQualityCorridor({
  baseUsage: result.usage,
  draft: result.draft,
  fallbackTripName: trip.name,
  preparedEvidence: prepared,
  sourceEvidenceArtifacts: result.evidenceArtifacts,
  tripId: trip.id ?? parse.trip_id,
});
const assembly = corridor.assembly;

const norm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const pieces = corridor.pieces;
const items = assembly.records.items;
const notesShipped = items.filter(
  (i) => i.itemType === "note" && i.status !== "ignored"
);
const placeholders = items.filter(
  (i) => i.itemType === "placeholder" && i.status !== "ignored"
);
const openReviewQuestions = assembly.records.reviewQuestions.filter(
  (question) => question.status === "open"
);
const sourceCoverageFindings = assembly.records.reviewQuestions.filter(
  (question) => /source coverage/i.test(question.dismissalReason ?? "")
);

const draftActivities = Array.isArray(assembly.draft?.activities)
  ? assembly.draft.activities
  : [];
const draftNotes = draftActivities.filter((item) => item?.itemType === "note");
console.log(`\n=== DRAFT/PIECE NOTE PROJECTION ===`);
console.log(
  `draft notes=${draftNotes.length}; eligible note pieces=${pieces.filter((piece) => piece.kind === "note" && piece.outputEligible).length}; recovery=${JSON.stringify(assembly.recovery)}`
);
for (const note of draftNotes) {
  console.log(
    `  draft ${note._canonicalId ?? note._canonicalPieceId ?? "no-id"} ${JSON.stringify(note.title)}`
  );
}

console.log(`\n=== PLACEHOLDERS THAT SHIPPED (${placeholders.length}) ===`);
for (const item of placeholders) {
  const matching = pieces.filter(
    (piece) =>
      piece.id === item.canonicalId ||
      norm(piece.payload.title) === norm(item.title)
  );
  console.log(`\n• ${JSON.stringify(item)}`);
  for (const piece of matching) {
    console.log(
      `  piece=${piece.id} kind=${piece.kind} role=${piece.role} eligible=${piece.outputEligible} disposition=${JSON.stringify(piece.disposition ?? null)}`
    );
    console.log(
      `  lastActions=${JSON.stringify((piece.actions ?? []).slice(-5).map((action) => ({ reason: action.reason, type: action.type })))}`
    );
  }
}

console.log(`\n=== OPEN REVIEW QUESTIONS (${openReviewQuestions.length}) ===`);
for (const question of openReviewQuestions) {
  console.log(`\n• ${JSON.stringify(question)}`);
}

console.log(`\n=== SOURCE-COVERAGE FINDINGS (${sourceCoverageFindings.length}) ===`);
for (const finding of sourceCoverageFindings) {
  console.log(`\n• ${JSON.stringify(finding)}`);
}

console.log(`\n=== SOURCE RECOVERY LEDGER ===`);
console.log(
  JSON.stringify(
    {
      coverage: result.usage?.sourceCoverage ?? null,
      finalProjectionSafety:
        result.usage?.evidence?.finalProjectionSafety ?? null,
      unresolvedFinalProjectionFacts:
        (result.usage?.evidence?.finalProjectionSafety?.contentCarrierDecisions ?? [])
          .filter((decision) => decision.outcome === "unresolved")
          .map((decision) => ({
            ...decision,
            source: pieces.find(
              (piece) => piece.id === decision.sourcePieceId
            )?.payload ?? null,
          })),
      recovery: result.usage?.sourceRecovery ?? null,
      deterministicResidualObservations:
        result.evidenceArtifacts.observations
          .filter(
            (observation) =>
              observation.payload?._canonicalDeterministicResidualReference ===
              true
          )
          .map((observation) => ({
            disposition: observation.disposition ?? null,
            id: observation.id,
            kind: observation.kind,
            payload: observation.payload,
            role: observation.role,
          })),
    },
    null,
    2
  )
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
  const matchingObservations = result.evidenceArtifacts.observations.filter(
    (observation) => norm(JSON.stringify(observation.payload)).includes(t)
  );
  const inAnyPiece = pieces.filter(
    (p) => norm(p.payload.title).includes(t) || norm(p.payload.description).includes(t)
  );
  const beforeAssembly = preparedPiecesBeforeAssembly.filter(
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
    `\n${token}: observations=${matchingObservations.length} beforeAssembly=${beforeAssembly.length} pieces=${inAnyPiece.length} eligible=${eligiblePiece.length} inEligibleNoteText=${inNotePieceText.length} inShippedNote=${inShippedNote.length} asCard=${asCard.length}`
  );
  for (const observation of matchingObservations.slice(0, 10)) {
    console.log(
      `   observation ${observation.id} kind=${observation.kind} role=${observation.role} payload=${JSON.stringify(observation.payload)}`
    );
  }
  for (const p of beforeAssembly.slice(0, 5)) {
    console.log(
      `   before "${p.payload.title}" kind=${p.kind} role=${p.role} groupingDecisionIds=${JSON.stringify(p.payload._canonicalGroupingDecisionIds ?? [])}`
    );
  }
  for (const p of inAnyPiece.slice(0, 8)) {
    console.log(
      `   piece "${p.payload.title}" kind=${p.kind} role=${p.role} eligible=${p.outputEligible} city=${JSON.stringify(p.payload.city)} date=${JSON.stringify(p.payload.date)}`
    );
    console.log(`      description=${JSON.stringify(p.payload.description ?? null)}`);
    console.log(
      `      candidacy=${JSON.stringify(p.payload._canonicalCandidacyDecision ?? null)} groupingDecisionIds=${JSON.stringify(p.payload._canonicalGroupingDecisionIds ?? [])}`
    );
    const contextObservationId =
      p.payload._canonicalCandidacyDecision?.ideaContextObservationId ?? null;
    if (contextObservationId) {
      const contextObservation = result.evidenceArtifacts.observations.find(
        (observation) => observation.id === contextObservationId
      );
      console.log(
        `      ideaContextObservation=${JSON.stringify(contextObservation ?? null)}`
      );
    }
    console.log(
      `      structure=${JSON.stringify({ area: p.payload.area ?? null, parentActivityTitle: p.payload.parentActivityTitle ?? null, sourceHeadingPath: p.payload.sourceHeadingPath ?? null, sourceOccurrences: p.payload._canonicalSourceOccurrences ?? null, sourceSectionLabel: p.payload.sourceSectionLabel ?? null, sourceSectionType: p.payload.sourceSectionType ?? null })}`
    );
    console.log(
      `      disposition=${JSON.stringify(p.disposition ?? null)} lastReasons=${JSON.stringify((p.actions ?? []).slice(-2).map((a) => `${a.type}: ${(a.reason ?? "").slice(0, 70)}`))}`
    );
    const tokenActions = (p.actions ?? []).filter((action) =>
      norm(JSON.stringify(action)).includes(t)
    );
    if (tokenActions.length > 0) {
      console.log(`      tokenActions=${JSON.stringify(tokenActions)}`);
    }
    if (p.disposition?.kind === "survivor") {
      const carrier = pieces.find((candidate) => candidate.id === p.disposition.survivorId);
      if (carrier) {
        console.log(
          `      carrier="${carrier.payload.title}" eligible=${carrier.outputEligible} containsToken=${norm([carrier.payload.title, carrier.payload.description].join(" ")).includes(t)} tokenActions=${JSON.stringify((carrier.actions ?? []).filter((action) => norm(JSON.stringify(action)).includes(t)))}`
        );
      }
    }
  }
}
