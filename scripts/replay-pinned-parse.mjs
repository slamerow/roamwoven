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
import { fileURLToPath } from "node:url";
import ts from "typescript";

// fileURLToPath, not URL.pathname: the repo lives at a path with spaces
// ("Claude - Roamwoven") and .pathname leaves them percent-encoded.
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

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
// The paid-extraction gate sits BEFORE the pin-cache lookup, so it must be
// open for a replay; the sentinel API key above keeps a cache miss loud
// and unpayable instead of a live call.
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
delete process.env.GEOCODE_VERIFICATION_API_KEY;
process.env.OPENAI_EXTRACTION_MODEL =
  process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.4-mini";
// hasSupabaseServerConfig() gates several loaders on an anon key being
// PRESENT, but every actual query here goes through the patched
// service-role client — a stand-in satisfies the truthiness gate without
// being used for any connection.
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

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

// Args (2026-07-25): the parse key has always accepted a PREFIX, but the trip
// id went straight into a Postgres `uuid` column via `.eq()`, so an 8-char
// trip prefix died with "invalid input syntax for type uuid" — and every trip
// id recorded in docs/next-session.md and the dockets is an 8-char prefix.
// That asymmetry made the documented replay commands unrunnable as written.
//
// A pinned parse row already carries its own `trip_id`, so the trip does not
// need to be supplied at all. Accepted forms:
//
//   node scripts/replay-pinned-parse.mjs <parseKeyPrefix>
//   node scripts/replay-pinned-parse.mjs <tripIdOrPrefix> <parseKeyPrefix>
//
// The two-arg form stays supported so existing handoff commands keep working;
// a full uuid narrows the query, and a prefix is verified against the trip the
// parse resolves to.
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.length > 2) {
  console.error(
    "usage: node scripts/replay-pinned-parse.mjs [<tripIdOrPrefix>] <parseKeyPrefix>"
  );
  process.exit(2);
}
const parseKeyPrefix = argv.length === 2 ? argv[1] : argv[0];
const requestedTrip = argv.length === 2 ? argv[0] : null;
const FULL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = adminModule.createSupabaseAdminClient();

function fail(message) {
  console.error(`REPLAY FAIL: ${message}`);
  process.exitCode = 1;
}

// Resolve the parse FIRST — it knows its own trip.
let parseQuery = admin
  .from("trip_extraction_parses")
  .select("trip_id,parse_key,extraction_model,sampling_params,material_fingerprints,calls_json,stats_json")
  .like("parse_key", `${parseKeyPrefix}%`);
if (requestedTrip && FULL_UUID.test(requestedTrip)) {
  parseQuery = parseQuery.eq("trip_id", requestedTrip);
}
const { data: parseRows, error: parseError } = await parseQuery;
if (parseError || !parseRows?.length) {
  console.error(
    `cannot load pinned parse ${parseKeyPrefix}…${
      requestedTrip ? ` for trip ${requestedTrip}` : ""
    }: ${parseError?.message ?? "no row"}`
  );
  process.exit(2);
}
// An ambiguous prefix is an explicit failure, never a silent first-match:
// replaying the wrong parse would look like a passing bar on the wrong input.
if (parseRows.length > 1) {
  console.error(
    `parse key prefix ${parseKeyPrefix}… is ambiguous (${parseRows.length} rows): ` +
      parseRows.map((row) => `${row.parse_key.slice(0, 16)} (trip ${row.trip_id})`).join(", ")
  );
  process.exit(2);
}
const parseRow = parseRows[0];
const tripId = parseRow.trip_id;
if (
  requestedTrip &&
  !FULL_UUID.test(requestedTrip) &&
  !tripId.startsWith(requestedTrip.toLowerCase())
) {
  console.error(
    `trip prefix ${requestedTrip} does not match the trip this parse belongs to (${tripId})`
  );
  process.exit(2);
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
console.log(`trip ${tripId} — ${tripRow.name ?? "(unnamed)"}`);
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
if (materials.length === 0) {
  console.error(
    "REPLAY FAIL: zero materials rebuilt — uploads or extraction checkpoints are not visible (check .env.local URL/keys and that the trip id is right)."
  );
  process.exit(1);
}

const pinning = require2(
  path.join(rootDir, "lib/extraction/extraction-pinning.ts")
);
const openaiModule = require2(path.join(rootDir, "lib/ai/openai.ts"));
// Task 3b (2026-07-31) — the sampling params for the key REBUILD come from
// the STORED ROW, not from local env.
//
// They used to come from `resolveExtractionSamplingParams()`, i.e. from
// whatever `.env.local` happened to hold on the laptop running the replay.
// Production sets `OPENAI_EXTRACTION_SEED` / `_TEMPERATURE`; `.env.local` does
// not. So the moment a live run records a pin under a seeded key, every local
// replay of it rebuilds a DIFFERENT key and dies on "parse key mismatch
// (materials or sampling params differ)" — a message that points at the
// materials, which are fine. That failure has nothing to do with the parse and
// everything to do with the operator's dotfile, and it would have made the
// pinning iteration loop unusable exactly when it finally became useful.
//
// The stored row records what the RECORDING run used, which is the only
// correct value for reproducing its key. Local env is still read, but only to
// warn: a divergence is worth knowing about (it means a fresh live run from
// this machine would write under a different key), and it is never fatal.
const storedSamplingParams =
  parseRow.sampling_params && typeof parseRow.sampling_params === "object"
    ? parseRow.sampling_params
    : {};
const localSamplingParams = openaiModule.resolveExtractionSamplingParams();
if (
  JSON.stringify(storedSamplingParams) !== JSON.stringify(localSamplingParams)
) {
  console.warn(
    `note: local sampling env ${JSON.stringify(localSamplingParams)} differs from the pin's ${JSON.stringify(storedSamplingParams)} — replaying against the STORED value. A fresh live run from this machine would write a different parse key.`
  );
}
const materialFingerprints = pinning.fingerprintExtractionMaterials(materials);
const parseKey = pinning.computeExtractionParseKey({
  materialFingerprints,
  model: parseRow.extraction_model,
  samplingParams: storedSamplingParams,
});
if (parseKey !== parseRow.parse_key) {
  fail(
    `parse key mismatch: rebuilt ${parseKey.slice(0, 12)}… vs stored ${parseRow.parse_key.slice(0, 12)}…. Sampling params were taken from the pin itself, so this is a MATERIALS difference — the uploads or their OCR checkpoints are not what they were when the pin was recorded.`
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
if (cache.hits < cache.seededEntryCount) {
  // Unused pins are as diagnostic as missed ones: a stage that ran with a
  // DIFFERENT input leaves its recorded twin untouched.
  console.log(
    `NOTE: ${cache.seededEntryCount - cache.hits} pinned call(s) went unused — ` +
      `a stage's input diverged from the recorded run`
  );
}
if (cache.misses > 0) {
  // Name the stages, so a miss is actionable rather than a mystery. Before
  // 2026-07-25 this could not fire at all in replay: the counter incremented
  // only after a successful network call, and in replay every miss throws on
  // the sentinel API key first — so a degraded replay printed misses=0 and
  // "BAR PASSED" while running with stages missing.
  for (const missed of cache.missedCalls ?? []) {
    console.error(
      `  MISSED PIN: schema=${missed.schemaName} hash=${missed.hash.slice(0, 12)}…`
    );
  }
  fail(
    `${cache.misses} model call(s) missed the pin — this replay is NOT a ` +
      `faithful reproduction and its bar result must not be trusted`
  );
}

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
