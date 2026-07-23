// Offline replay of a pinned extraction parse (Arc F; AGENTS.md operating
// discipline: replay-validate fixes against pinned parses BEFORE any live
// run). Usage:
//
//   node scripts/replay-pinned-parse.mjs <tripId> <parseKeyPrefix>
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY (read access to trips, trip_uploads,
// material_extractions, trip_extraction_parses). No OpenAI key is needed:
// every model call must be answered by the pin — a cache MISS is a
// failure of the replay, never a live call (OPENAI_API_KEY is set to a
// sentinel so an accidental miss dies loudly instead of spending tokens).
//
// The geocode verification lane is NOT pinned (it is not an OpenAI-client
// call); it stays disabled here, so verified-coordinate grouping can
// differ from the live run. The run-1 audit bar items this script judges
// (privacy, stays, cost cards, spine counts, repair trigger) do not
// depend on that lane.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

// --- .env.local ------------------------------------------------------------
const envPath = path.join(rootDir, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}
process.env.OPENAI_API_KEY = "replay-must-not-call-the-network";
delete process.env.GEOCODE_VERIFICATION_API_KEY;
process.env.OPENAI_EXTRACTION_MODEL =
  process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.4-mini";

// --- TS require hook (same mechanics as scripts/run-tests.mjs) -------------
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

// --- service-role Supabase in place of the cookie-bound server client ------
const adminModule = require2(path.join(rootDir, "lib/supabase/admin.ts"));
const serverModule = require2(path.join(rootDir, "lib/supabase/server.ts"));
serverModule.createSupabaseServerClient = async () =>
  adminModule.createSupabaseAdminClient();

const [tripId, parseKeyPrefix] = process.argv.slice(2);
if (!tripId || !parseKeyPrefix) {
  console.error(
    "usage: node scripts/replay-pinned-parse.mjs <tripId> <parseKeyPrefix>"
  );
  process.exit(2);
}

const admin = adminModule.createSupabaseAdminClient();

function fail(message) {
  console.error(`REPLAY FAIL: ${message}`);
  process.exitCode = 1;
}

const { data: tripRow, error: tripError } = await admin
  .from("trips")
  .select("id,name")
  .eq("id", tripId)
  .maybeSingle();
if (tripError || !tripRow) {
  console.error(`cannot load trip ${tripId}: ${tripError?.message}`);
  process.exit(2);
}

const { data: parseRows, error: parseError } = await admin
  .from("trip_extraction_parses")
  .select("parse_key,extraction_model,sampling_params,material_fingerprints,calls_json,stats_json")
  .eq("trip_id", tripId)
  .like("parse_key", `${parseKeyPrefix}%`);
if (parseError || !parseRows?.length) {
  console.error(
    `cannot load pinned parse ${parseKeyPrefix}… for trip ${tripId}: ${parseError?.message ?? "no row"}`
  );
  process.exit(2);
}
const parseRow = parseRows[0];
console.log(
  `pinned parse ${parseRow.parse_key.slice(0, 12)}… — ${parseRow.calls_json.length} calls, model ${parseRow.extraction_model}`
);

// --- rebuild materials exactly as the route does ---------------------------
const uploadsModule = require2(path.join(rootDir, "lib/uploads.ts"));
const materialsModule = require2(
  path.join(rootDir, "lib/extraction/trip-materials.ts")
);
const uploads = await uploadsModule.listTripUploads(tripId);
const prepared = await materialsModule.getTripExtractionMaterialsWithSummary(
  uploads,
  { retryFailedOcr: false }
);
const materials = prepared.materials;
console.log(`materials rebuilt: ${materials.length}`);

const pinning = require2(
  path.join(rootDir, "lib/extraction/extraction-pinning.ts")
);
const openaiModule = require2(path.join(rootDir, "lib/ai/openai.ts"));
const samplingParams = openaiModule.resolveExtractionSamplingParams();
const materialFingerprints = pinning.fingerprintExtractionMaterials(materials);
const parseKey = pinning.computeExtractionParseKey({
  materialFingerprints,
  model: parseRow.extraction_model,
  samplingParams,
});
if (parseKey !== parseRow.parse_key) {
  fail(
    `parse key mismatch: rebuilt ${parseKey.slice(0, 12)}… vs stored ${parseRow.parse_key.slice(0, 12)}… (materials or sampling params differ)`
  );
  process.exit(1);
}
console.log("parse key matches — material reconstruction is byte-identical");

// --- replay ---------------------------------------------------------------
const parser = require2(
  path.join(rootDir, "lib/extraction/openai-trip-parser.ts")
);
const cache = pinning.createExtractionParseCache(parseRow.calls_json);
const result = await pinning.runWithExtractionParseCache(cache, () =>
  parser.extractTripDraftWithOpenAI({ materials, tripName: tripRow.name })
);
console.log(
  `replayed: hits=${cache.hits} misses=${cache.misses} (seeded ${cache.seededEntryCount})`
);
if (cache.misses > 0) fail(`${cache.misses} model calls missed the pin`);

// --- assemble + audit exactly as the route does ---------------------------
const assemblyModule = require2(
  path.join(rootDir, "lib/extraction/canonical-trip-assembly.ts")
);
const qualityModule = require2(
  path.join(rootDir, "lib/extraction/trip-quality-assessment.ts")
);
const preparedEvidence = assemblyModule.prepareCanonicalEvidencePieces(
  result.evidenceArtifacts.pieces
);
const assembly = assemblyModule.assembleCanonicalTripDraft({
  draft: result.draft,
  evidencePieces: preparedEvidence.pieces,
  fallbackTripName: tripRow.name,
  priorRecoveryActions: preparedEvidence.recoveryActions,
  tripId,
});
const observations = assemblyModule.materializeCanonicalEvidenceObservations({
  draft: assembly.draft,
  observations: result.evidenceArtifacts.observations,
  pieces: preparedEvidence.pieces,
});
const usage = {
  ...(result.usage && typeof result.usage === "object" ? result.usage : {}),
  finalization: assembly.finalization,
  identityRecovery: assembly.recovery,
};
const assessment = qualityModule.assessTripDraftQuality({
  draft: assembly.draft,
  evidenceArtifacts: { observations, pieces: preparedEvidence.pieces },
  records: assembly.records,
  usage,
});
const records = assembly.records;
const report = assessment.report;

// --- run-1 audit bar -------------------------------------------------------
console.log("\n=== RUN-1 BAR (offline replay) ===");
const activeLegs = records.legs.filter((leg) => leg.status !== "ignored");
const activeTransport = records.transport.filter(
  (row) => row.status !== "ignored"
);
const activeStays = records.stays.filter((stay) => stay.status !== "ignored");
const bar = (name, pass, detail) => {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
  if (!pass) process.exitCode = 1;
};
bar("run completes", true, "assembly returned a draft");
bar("5 legs", activeLegs.length === 5, `got ${activeLegs.length}`);
bar(
  "8 transport rows",
  activeTransport.length === 8,
  `got ${activeTransport.length}`
);
bar("5 stays", activeStays.length === 5, `got ${activeStays.length}`);
const phantom = preparedEvidence.pieces.find(
  (piece) =>
    piece.kind === "stay" &&
    !piece.outputEligible &&
    piece.actions?.some((action) => /booking material/.test(action.reason ?? ""))
);
bar(
  "phantom stay suppressed with disposition",
  Boolean(phantom) || activeStays.length === 5,
  phantom ? `piece ${phantom.id}` : "no person-named stay candidate in this parse"
);
const identityP0 = report.diagnostics.filter(
  (diagnostic) => diagnostic.code === "identity_value_in_public_prose"
);
bar("zero identity signals in public fields", identityP0.length === 0,
  identityP0.map((d) => d.evidence.join("; ")).join(" | "));
const codeP0 = report.diagnostics.filter(
  (diagnostic) => diagnostic.code === "protected_code_shape_in_public_prose"
);
bar("zero code-shape tokens in protected prose", codeP0.length === 0,
  codeP0.map((d) => d.evidence.join("; ")).join(" | "));
const costCards = records.items.filter(
  (item) =>
    item.status !== "ignored" &&
    /\b(?:lodging|hotel|room|stay|accommodation)\s+cost\b|\bcost\s+for\b/i.test(
      item.title ?? ""
    )
);
const costDiag = report.diagnostics.filter(
  (diagnostic) => diagnostic.code === "planning_cost_line_shipped_as_card"
);
bar(
  "no cost-line cards on any path",
  costCards.length === 0 && costDiag.length === 0,
  costCards.map((item) => item.title).join(", ")
);
const recovery = assembly.recovery;
bar(
  "repair trigger named",
  recovery.status === "not_needed" || recovery.initialViolations.length > 0,
  `status=${recovery.status}; violations=[${recovery.initialViolations.join(" | ")}]`
);
const dismissed = records.reviewQuestions.filter(
  (question) => question.status === "dismissed"
);
console.log(
  `dismissed questions: ${dismissed.length}${dismissed
    .map((q) => `\n  - "${q.prompt}" -> ${q.dismissalReason}`)
    .join("")}`
);
console.log(
  `email-shaped titles in items: ${records.items.filter((item) => /@/.test(item.title ?? "")).length}`
);
console.log("\ndiagnostics:", report.diagnostics.map((d) => `${d.severity}:${d.code}`).join(", ") || "(none)");
console.log(process.exitCode ? "\nREPLAY: BAR FAILED" : "\nREPLAY: BAR PASSED");
