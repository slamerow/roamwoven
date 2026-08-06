// Assembly scorecard — the approved answer key as executable assertions,
// each labelled with the contract entry it proves.
//
//   node scripts/scorecard.mjs [--dry-run] [--out <path>] [<tripIdOrPrefix>] <parseKeyPrefix>
//   node scripts/scorecard.mjs --payload <audit-payload.json> [--out <path>]
//   node scripts/scorecard.mjs --qa-bundle <qa-bundle.json> [--audit-payload <audit-payload.json>] [--out <path>]
//
// Defaults to the run-8.1.0 pin:
//   node scripts/scorecard.mjs 4eaf3c6c-f480-442b-8301-c425a032cb87 a3e0ab66
//
// TASK 0 (docs/assembly-restructure-work-order-2026-08-04.md): replay needs
// the database, and the database is reachable only from Eli's laptop, so
// every measure-a-fix cycle needed him in the loop. Two flags remove that:
//
//   node scripts/scorecard.mjs --export <dir>              # Eli runs this once
//   node scripts/scorecard.mjs --from-cache <dir>           # everyone else, offline
//
// `--export` runs the ordinary replay below and additionally writes the
// pinned parse row plus the rebuilt materials to `<dir>`. `--from-cache`
// reads that same directory and runs the identical assembly/audit/assertion
// path with ZERO network calls — it never constructs the Supabase client.
// Both still recompute the parse key from the materials and abort on
// mismatch: that recompute, not a stored value, is what would catch the
// cache going stale if the uploads changed.
//
// TWO INPUTS, ONE ASSERTION TABLE. The assertions are written once; only the
// context they read is built two ways, because the two inputs see different
// halves of the system and neither sees all of it.
//
//   REPLAY (default) re-assembles the pinned parse. Full `records`, so
//   identity/placement/question assertions are exact. Since 2026-08-05 it also
//   reattaches the verified geocode outputs persisted on THAT saved processing
//   run, at the original geocode boundary, under an async-local replay context.
//   Before that snapshot existed, replay grouped 14 stops where production
//   grouped 7 because it substituted parser coordinates production's locked
//   policy rejects. A replay without the matching geocode snapshot now ABORTS
//   instead of silently measuring a different configuration.
//
//   PAYLOAD (`--payload`) scores what the LIVE run actually shipped, read from
//   `/maker/trips/<tripId>/data/audit/payload` — the 215-row unfiltered audit
//   report, not the 120-row QA bundle the 2026-07-31 docket §5 shows is
//   filtered to suppressed rows only. The geocode lane RAN, so the
//   wrong-group assertions become answerable. What it does not carry is
//   `records.legs` and the review-question internals, which are NOT CHECKABLE
//   here instead.
//
// Neither mode is allowed to report PASS for something it cannot see. Where
// the two disagree, the payload is evidence about a run that happened and the
// replay is evidence about code as it stands now.
//
// WHAT THIS IS FOR. Twelve audit rounds diagnosed whichever symptom was
// loudest. This scores the whole contract at once so the fix queue is chosen
// from a ranked list rather than from the last thing someone noticed. It fixes
// nothing and mutates nothing.
//
// FOUR STATES, because two states hid three different problems:
//
//   PASS           the contract held.
//   FAIL           built, and wrong. A defect or a drift. Investigate.
//   NOT_BUILT      contract text with no implementation. Expected work, not a
//                  defect. Never filtered out of the report; always counted.
//   NOT_CHECKABLE  the assertion cannot be evaluated because the data reaches
//                  no surface. This is an observability defect in its own
//                  right — it is how verified coordinates went unscored in run
//                  2 (docket 2026-07-28 §C) and how `verifiedFormattedAddress`
//                  is unscored today (docket 2026-07-31 §4c), which is the
//                  field that decides group membership.
//
// TWO RULES SO `NOT_BUILT` DOES NOT BECOME A HIDING PLACE:
//
//   1. Every NOT_BUILT declaration carries a static PROBE. If the probe finds
//      an implementation, the declaration is stale, the assertion is evaluated
//      anyway, and the stale declaration is itself reported as a finding.
//   2. NOT_BUILT is only legitimate if the ledger's `Enforcement:` field
//      agrees. An entry claiming `ENFORCED` or `PARTIAL` while the scorecard
//      finds NOT_BUILT is the LEDGER overstating its own coverage. Those are
//      reported separately from code defects, because they are a different
//      kind of failure and have a different fix.
//
// LIMITS OF THIS METHOD, cited per AGENTS.md rule 7(a). The 2026-08-04 replay
// exposed a policy divergence: live run 8.1.0 grouped 7 stops while the same
// pinned parse, with geocoding disabled, grouped 14. Since 2026-08-05 the
// scorecard therefore requires the completed geocode snapshot persisted on
// the processing run whose extraction pin matches this parse. It reattaches
// those provider outputs at the original boundary and aborts if the candidate
// pool or any stable candidate id differs. Group-membership assertions are now
// judgeable in both payload and replay modes. This proves current assembly
// behavior against the saved provider result; it does not claim a future live
// provider response would return the same places.
//
// Tier 2 assertions each cite the `docs/assembly-ground-truth-central-europe.md`
// line they came from, and the harness verifies the citation still resolves to
// the expected text. A disputed FAIL is settled by reading one line.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- CLI -------------------------------------------------------------------
const rawArgv = process.argv.slice(2);
const DRY_RUN = rawArgv.includes("--dry-run");
const STRICT = rawArgv.includes("--strict");
let outPath = null;
let payloadPath = null;
let qaBundlePath = null;
let qaAuditPayloadPath = null;
let exportDir = null;
let fromCacheDir = null;
const positional = [];
for (let index = 0; index < rawArgv.length; index += 1) {
  const value = rawArgv[index];
  if (value === "--dry-run" || value === "--strict") continue;
  if (value === "--out") {
    outPath = rawArgv[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (value === "--payload") {
    payloadPath = rawArgv[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (value === "--qa-bundle") {
    qaBundlePath = rawArgv[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (value === "--audit-payload") {
    qaAuditPayloadPath = rawArgv[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (value === "--export") {
    exportDir = rawArgv[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (value === "--from-cache") {
    fromCacheDir = rawArgv[index + 1] ?? null;
    index += 1;
    continue;
  }
  positional.push(value);
}
// `--export` still needs the database (it IS the replay); `--from-cache`
// must not touch it (that is the whole point). Combining either with
// `--payload`, or the two with each other, has no coherent meaning.
if (fromCacheDir && exportDir) {
  console.error("--from-cache and --export are mutually exclusive: pick one.");
  process.exit(2);
}
if (payloadPath && qaBundlePath) {
  console.error("--payload and --qa-bundle are mutually exclusive input surfaces.");
  process.exit(2);
}
if (qaAuditPayloadPath && !qaBundlePath) {
  console.error("--audit-payload is a companion to --qa-bundle.");
  process.exit(2);
}
if (payloadPath && (fromCacheDir || exportDir)) {
  console.error(
    "--payload scores saved production; --from-cache/--export are replay-only."
  );
  process.exit(2);
}
if (qaBundlePath && exportDir) {
  console.error("--qa-bundle cannot be combined with --export.");
  process.exit(2);
}

const DEFAULT_TRIP = "4eaf3c6c-f480-442b-8301-c425a032cb87";
const DEFAULT_PARSE_KEY = "a3e0ab66";
const parseKeyPrefix =
  positional.length === 2
    ? positional[1]
    : positional.length === 1
      ? positional[0]
      : DEFAULT_PARSE_KEY;
const requestedTrip = positional.length === 2 ? positional[0] : DEFAULT_TRIP;

const GROUND_TRUTH_DOC = "docs/assembly-ground-truth-central-europe.md";
const CONTRACT_DOC = "docs/product-contracts.md";
const SCOPE = [
  "RW-ORD-001",
  "RW-QA-001",
  "RW-CAN-001",
  "RW-GRP-001",
  "RW-ASM-001",
  "RW-CLS-001",
  "RW-EVD-001",
  "RW-REV-001",
  "RW-QUE-001",
  "RW-PRI-001",
  "RW-AUD-001",
  "RW-OPS-001",
  "RW-PLC-001",
];

// The trip's source dates carry 2019 (docket 2026-07-31 §3, lineage rows 33
// and 40: `date: 2019-01-16`). The ground truth writes them without a year.
const Y = "2019";
const JAN16 = `${Y}-01-16`;
const JAN19 = `${Y}-01-19`;
const JAN20 = `${Y}-01-20`;

// --- bootstrap (mechanics copied verbatim from replay-pinned-parse.mjs) -----
const envPath = path.join(rootDir, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}
process.env.OPENAI_API_KEY = "scorecard-must-not-call-the-network";
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
delete process.env.GEOCODE_VERIFICATION_API_KEY;
process.env.OPENAI_EXTRACTION_MODEL =
  process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.4-mini";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";

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

// The container predicate comes from the SAME export both production lanes
// use, so the container definition cannot drift between the code and the
// scorecard that judges it (docket 2026-07-31 §8 Task A).
const { SAME_SITE_CONTAINER_PATTERN } = require2(
  path.join(rootDir, "lib/extraction/evidence-clustering.ts")
);

// --- text helpers ----------------------------------------------------------
const norm = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const has = (haystack, needle) => norm(haystack).includes(norm(needle));
const titled = (record) => record?.title ?? "";
const list = (values, max = 6) => {
  const shown = values.slice(0, max).join(", ");
  return values.length > max ? `${shown}, +${values.length - max} more` : shown;
};
const containerish = (title) => SAME_SITE_CONTAINER_PATTERN.test(String(title ?? ""));

// --- ground-truth citations ------------------------------------------------
const groundTruthLines = fs
  .readFileSync(path.join(rootDir, GROUND_TRUTH_DOC), "utf8")
  .split("\n");

const citationFindings = [];
function citation(lineNumber, expectedSubstring) {
  const text = groundTruthLines[lineNumber - 1] ?? "";
  if (!has(text, expectedSubstring)) {
    citationFindings.push(
      `${GROUND_TRUTH_DOC}:${lineNumber} no longer contains the expected safe phrase ` +
        `"${expectedSubstring}". The assertion citing it is unverified; inspect the source locally.`
    );
  }
  // Reports are designed to be commit-safe. Never echo the full ground-truth
  // line here: some cited rows contain protected lodging or booking values.
  return { line: lineNumber, expected: expectedSubstring };
}

// --- ledger enforcement states --------------------------------------------
const contractSource = fs.readFileSync(path.join(rootDir, CONTRACT_DOC), "utf8");
const ledgerEnforcement = new Map();
{
  const headings = [...contractSource.matchAll(/^## (RW-[A-Z]+-\d{3}) — .+$/gm)];
  headings.forEach((match, index) => {
    const body = contractSource.slice(
      match.index ?? 0,
      headings[index + 1]?.index ?? contractSource.length
    );
    ledgerEnforcement.set(
      match[1],
      body.match(/^- Enforcement: `([^`]+)`$/m)?.[1] ?? "(unstated)"
    );
  });
}

// --- NOT_BUILT probes ------------------------------------------------------
// A probe greps the shipping source for the symbol an implementation would
// have to introduce. Finding one does not prove the feature works; NOT finding
// one does prove it was never written, which is all NOT_BUILT claims.
const PROBE_ROOTS = ["lib", "app", "components"];
function probeSource(pattern) {
  const hits = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        if (pattern.test(fs.readFileSync(full, "utf8"))) {
          hits.push(path.relative(rootDir, full));
        }
      }
    }
  };
  for (const root of PROBE_ROOTS) walk(path.join(rootDir, root));
  return hits;
}

// ===========================================================================
// ASSERTIONS
//
// Every assertion returns { ok } or { state }, plus `field` — the field it
// actually read — and `detail`. `field` is not decoration: an assertion whose
// field cannot be named is an assertion nobody can re-derive.
// ===========================================================================

const ASSERTIONS = [
  // ---------------------------------------------------------------- RW-ORD-001
  {
    id: "ORD-1",
    entry: "RW-ORD-001",
    tier: 1,
    clause: "Invariant A — no later stage deletes a record an earlier stage justified",
    claim:
      "No piece that reached `atomic_candidate` with a real date is suppressed with no surviving record carrying it",
    run: (ctx) => {
      // Invariant A permits a great deal: a flight becoming a transport row,
      // check-in text moving to the stay, a Costs line excluded by contract, a
      // duplicate folding into a survivor. What it forbids is the record
      // reaching NOTHING. A disposition is legitimate when its destination can
      // be pointed at — so "routed into the city note" counts only when the
      // note that shipped actually contains it.
      const STRUCTURAL =
        /canonical transport|attached to stay|stay material|Costs-section|represented by canonical stay|attached to pickup|merged into its canonical entity|no source support|folded into|generic bath evidence|duplicate entry removed|content beats context|day-plan copy|day-plan visit wins/i;
      const TO_NOTES = /note collection|city-note copy is the single home|stay city notes/i;
      const lost = [];
      const unexplained = [];
      for (const row of ctx.report.lineage) {
        if (row.status !== "suppressed" || row.finalRecords.length > 0) continue;
        if (
          !row.observations.some(
            (observation) =>
              observation.role === "atomic_candidate" && observation.date
          )
        ) {
          continue;
        }
        if (ctx.carriers.has(norm(row.title))) continue;
        const reasons = (row.actions ?? [])
          .map((action) => action.reason ?? "")
          .join(" ~ ");
        if (TO_NOTES.test(reasons)) {
          if (!has(ctx.noteText, row.title)) lost.push(`"${row.title}"`);
          continue;
        }
        if (STRUCTURAL.test(reasons)) continue;
        unexplained.push(`"${row.title}"`);
      }
      const total = lost.length + unexplained.length;
      return {
        ok: total === 0,
        field:
          "report.lineage[].actions[].reason + .finalRecords[] vs the City Note text that shipped",
        detail:
          total === 0
            ? "every justified record reaches a final record, a carrier, or a destination that contains it"
            : [
                lost.length > 0
                  ? `${lost.length} routed into a City Note and NOT present in it: ${list(lost)}`
                  : null,
                unexplained.length > 0
                  ? `${unexplained.length} suppressed with no destination: ${list(unexplained)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" | "),
      };
    },
  },
  {
    id: "ORD-2",
    entry: "RW-ORD-001",
    tier: 1,
    clause:
      "Invariant A — a named site container ships as a standalone Activity regardless of child count",
    claim:
      "Every dated named-site container that reached `atomic_candidate` appears as a top-level item",
    run: (ctx) => {
      const containers = ctx.report.lineage.filter(
        (row) =>
          containerish(row.title) &&
          row.observations.some(
            (observation) =>
              observation.role === "atomic_candidate" && observation.date
          )
      );
      // A dateless `placeholder` stub bearing the right title is NOT the
      // container shipping — it is the defect RW-PLC-001 forbids wearing the
      // container's name. The survivor must be a real, dated, top-level card.
      const missing = containers.filter(
        (row) =>
          !ctx.records.items.some(
            (item) =>
              item.status !== "ignored" &&
              !item.parentItemId &&
              item.itemType !== "placeholder" &&
              item.date &&
              (has(item.title, row.title) || has(row.title, item.title))
          )
      );
      return {
        ok: missing.length === 0,
        field:
          "records.items[].title/.date/.itemType/.parentItemId vs report.lineage[].title",
        detail:
          `${containers.length} dated site container(s) justified; ` +
          (missing.length === 0
            ? "all ship as real dated top-level cards"
            : `${missing.length} with no dated card: ${list(
                missing.map((row) => `"${row.title}"`)
              )}`),
      };
    },
  },
  {
    id: "ORD-3",
    entry: "RW-ORD-001",
    tier: 1,
    clause: "Invariant B — containment beats identity",
    claim:
      "No named site container was absorbed by a sibling that is not itself a container",
    run: (ctx) => {
      // Run 8.1.0 flagged `"Prague Castle area beer note" -> "Prague Notes &
      // Tips" (attached)` — a city NOTE correctly filed into the city's note
      // collection, misread as a container being eaten, purely because the
      // word "Castle" inside the note's own title trips
      // `SAME_SITE_CONTAINER_PATTERN`. Keyed the exclusion on the ABSORBED
      // side (its title reads as note material), not on the absorbing side
      // (whether the sibling is a Notes collection): keying on the absorbing
      // side would also hide the real defect this assertion exists to catch —
      // a genuine site container silently swallowed BY a City Note collection
      // — since that case has the same absorbing-side shape as this false
      // positive. A real container's title never itself says "note".
      const NOTE_MATERIAL_TITLE = /\bnotes?\b/i;
      const swallowed = [];
      for (const row of ctx.report.lineage) {
        if (containerish(row.title)) continue;
        for (const action of row.actions ?? []) {
          for (const absorbed of action.absorbedTitles ?? []) {
            if (!containerish(absorbed)) continue;
            if (NOTE_MATERIAL_TITLE.test(absorbed)) continue;
            swallowed.push(`"${absorbed}" -> "${row.title}" (${action.type})`);
          }
        }
      }
      return {
        ok: swallowed.length === 0,
        field: "report.lineage[].actions[].absorbedTitles vs .title",
        detail:
          swallowed.length === 0
            ? "no container lost its identity to a sibling"
            : `${swallowed.length}: ${list(Array.from(new Set(swallowed)))}`,
      };
    },
  },
  {
    id: "ORD-4",
    entry: "RW-ORD-001",
    tier: 1,
    clause: "Decision anchors — every maker-facing decision records a stable anchor",
    claim:
      "Maker-facing decisions carry a leg-key/date/normalized-title or source anchor alongside the piece id",
    run: (ctx) => {
      const rows = ctx.report.fingerprints?.decisionAnchors ?? [];
      const expected =
        (ctx.report.fingerprints?.counts?.calls ?? 0) +
        (ctx.report.fingerprints?.counts?.openQuestions ?? 0);
      const malformed = rows.filter((row) => {
        const parts = String(row).split("|");
        const [status, canonicalId, version, subjectType, legKey, date, title, sourceRef] = parts;
        const sourceRefLooksValid =
          !sourceRef || /^review [a-f0-9]{8}$/.test(sourceRef);
        return !(
          (status === "open" || status === "noted") &&
          canonicalId &&
          version === "1" &&
          subjectType === "review question" &&
          sourceRefLooksValid &&
          (sourceRef || (title && (legKey || date)))
        );
      });
      return {
        ok: rows.length === expected && malformed.length === 0,
        field:
          "report.fingerprints.decisionAnchors[] vs counts.calls + counts.openQuestions",
        detail:
          `${rows.length}/${expected} maker-facing decision anchor(s) served; ` +
          `${malformed.length} malformed`,
      };
    },
  },

  // ---------------------------------------------------------------- RW-CLS-001
  {
    id: "CLS-1",
    entry: "RW-CLS-001",
    tier: 1,
    clause:
      "Density is a soft trigger, never a classifier — an overfull day means a block was mis-typed",
    claim: "No `activity_bloat` warning is raised",
    run: (ctx) => {
      const bloat = ctx.report.warnings.filter(
        (warning) => warning.code === "activity_bloat"
      );
      return {
        ok: bloat.length === 0,
        field: "report.warnings[].code",
        detail:
          bloat.length === 0
            ? "no day reported itself overfull"
            : `${bloat.length} raised — the system observing its own misclassification and reporting it instead of resolving it: ${list(
                bloat.map((warning) => warning.title)
              )}`,
      };
    },
  },
  {
    id: "CLS-2",
    entry: "RW-CLS-001",
    tier: 1,
    clause: "Intent is typed per BLOCK, not per day",
    claim:
      "A dated day section holding a plan block and an idea block classifies each independently",
    run: (ctx) => {
      const blocks = ctx.report.canonicalization?.intentBlocks?.blocks ?? [];
      const typesByDate = new Map();
      for (const block of blocks) {
        const types = typesByDate.get(block.date) ?? new Set();
        types.add(block.type);
        typesByDate.set(block.date, types);
      }
      const mixedDates = [...typesByDate.entries()]
        .filter(([, types]) => types.has("plan") && types.has("ideas"))
        .map(([date]) => date);
      return {
        ok: mixedDates.length > 0,
        field:
          "report.canonicalization.intentBlocks.blocks[].date/.type/.observationIds/.reason",
        detail:
          blocks.length === 0
            ? "no served intent-block ledger"
            : `${blocks.length} block decision(s); mixed plan+ideas dates: ${mixedDates.length > 0 ? mixedDates.join(", ") : "none"}`,
      };
    },
  },
  {
    id: "CLS-3",
    entry: "RW-CLS-001",
    tier: 1,
    clause:
      "City Notes are keyed to a city and anchored on its legs; a City Note has no day",
    claim: "Every active City Note is dateless, city-keyed, and owns no leg",
    run: (ctx) => {
      if (ctx.source === "persisted-qa") {
        const notes = ctx.records.items.filter(
          (item) => item.status !== "ignored" && item.itemType === "note"
        );
        const fingerprintNotes = ctx.report.fingerprints?.activeNotes ?? [];
        const malformedRecord = notes.filter((item) => item.date || item.legId);
        const malformedFingerprint = fingerprintNotes.filter((entry) => {
          const [cityNoteKey, date] = String(entry).split("|");
          return !cityNoteKey || Boolean(date);
        });
        const ok =
          notes.length === fingerprintNotes.length &&
          malformedRecord.length === 0 &&
          malformedFingerprint.length === 0;
        return {
          ok,
          field:
            "exact records.items[].date/.legId + audit.fingerprints.activeNotes[].cityNoteKey/date",
          detail: ok
            ? "every exact persisted note is dateless/legless and its persisted fingerprint carries one city key"
            : `${notes.length} note row(s), ${fingerprintNotes.length} keyed fingerprint row(s), ` +
              `${malformedRecord.length + malformedFingerprint.length} malformed`,
        };
      }
      const malformed = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          item.itemType === "note" &&
          (item.date || item.legId || !item.cityNoteKey)
      );
      return {
        ok: malformed.length === 0,
        field:
          "records.items[].itemType + .date + .legId + .cityNoteKey",
        detail:
          malformed.length === 0
            ? "every active note has one city key, no date, and no owning leg"
            : `${malformed.length} malformed note(s): ${list(
                malformed.map(
                  (item) =>
                    `"${item.title}" date=${item.date ?? "null"} leg=${item.legId ?? "null"} city=${item.cityNoteKey ?? "null"}`
                )
              )}`,
      };
    },
  },

  // ---------------------------------------------------------------- RW-GRP-001
  {
    id: "GRP-1",
    entry: "RW-GRP-001",
    tier: 1,
    clause:
      "Only source bytes are source evidence; source nesting establishes candidacy, distance only corroborates",
    claim: "Every group child is traceable to source nesting",
    // Membership assertion: WHICH children ended up under WHICH parent. Replay
    // groups on unverified coordinates production discards once the geocode
    // lane has run anywhere in the trip (2026-08-04 replay: live 7 grouped
    // stops vs replay 14, 10 with no source backing) — payload-only.
    judgeableIn: ["payload", "persisted-qa", "replay"],
    run: (ctx) => {
      const children = ctx.records.items.filter(
        (item) => item.status !== "ignored" && item.parentItemId
      );
      const byId = new Map(ctx.records.items.map((item) => [item.id, item]));
      const untraceable = children.filter((child) => {
        const parent = byId.get(child.parentItemId);
        if (!parent) return true;
        if (has(parent.description ?? "", child.title)) return false;
        if (has(child.title, parent.title)) return false;
        const tail = /\bat\s+(.+)$/i.exec(child.title)?.[1];
        if (tail && (has(parent.title, tail) || has(tail, parent.title))) return false;
        return true;
      });
      if (untraceable.length > 0 && ctx.geocodeRan) {
        // With the lane live, an untraceable child came in either by radius or
        // by the address path — and `verifiedFormattedAddress` is projected
        // onto no served surface (docket 2026-07-31 §4c), so which one is
        // unreadable. That distinction is the whole of root cause B.
        return {
          state: "NOT_CHECKABLE",
          field:
            "records.items[].parentItemId + parent .description; `verifiedFormattedAddress` reaches no surface",
          detail: `${untraceable.length} child(ren) not traceable to the container's description, and the address path that may have admitted them is unreadable: ${list(
            untraceable.map((child) => `"${child.title}"`)
          )}`,
        };
      }
      return {
        ok: untraceable.length === 0,
        field: "records.items[].parentItemId + parent .description/.title",
        detail:
          `${children.length} grouped stop(s); ` +
          (untraceable.length === 0
            ? "all traceable to the container's own text"
            : `${untraceable.length} admitted with the geocode lane OFF and no source nesting: ${list(
                untraceable.map((child) => `"${child.title}"`)
              )}`),
      };
    },
  },
  {
    id: "GRP-2",
    entry: "RW-GRP-001",
    tier: 1,
    clause: "The echo rule — a result within ~50 m of the injected container is not evidence",
    claim: "Every container-context retry is backed by the container's own description",
    // Exact shared points are not themselves a defect: aliases and true
    // estate components can legitimately resolve to one provider address.
    // The causal defect is an UNLISTED candidate borrowing the container in
    // its retry query (run 8.1: Museum of Illusions / Ring Tram / Trdelník).
    // G5.1 serves the source-support verdict per candidate, so this assertion
    // now reads the acceptance boundary instead of guessing entity identity
    // from coordinate equality.
    judgeableIn: ["payload", "persisted-qa", "replay"],
    run: (ctx) => {
      const geocode = ctx.report.extraction?.geocodeVerification;
      if (!geocode || !Array.isArray(geocode.candidates)) {
        return {
          state: "NOT_CHECKABLE",
          field: "report.extraction.geocodeVerification.candidates[]",
          detail: "the served audit has no geocode candidate ledger",
        };
      }
      const missingVerdict = geocode.candidates.filter(
        (row) =>
          !("containerSourceSupported" in row) || !("containerTitle" in row)
      );
      if (missingVerdict.length > 0) {
        return {
          state: "NOT_CHECKABLE",
          field:
            "report.extraction.geocodeVerification.candidates[].containerTitle/.containerSourceSupported",
          detail: `${missingVerdict.length} candidate row(s) omit the causal retry verdict`,
        };
      }
      const containerRetries = geocode.candidates.filter(
        (row) =>
          row.retried === true &&
          typeof row.containerTitle === "string" &&
          has(row.retryQuery ?? "", row.containerTitle)
      );
      const unsafe = containerRetries.filter(
        (row) => row.containerSourceSupported !== true
      );
      return {
        ok: unsafe.length === 0,
        field:
          "report.extraction.geocodeVerification.candidates[].retryQuery/.containerTitle/.containerSourceSupported",
        detail:
          unsafe.length === 0
            ? `${containerRetries.length} container retry/retries, all source-supported; ${
                geocode.retryUnlistedContainerCount ?? 0
              } unlisted retry/retries refused before lookup`
            : `${unsafe.length} source-unlisted container retry/retries: ${list(
                unsafe.map((row) => row.retryQuery ?? row.query)
              )}`,
      };
    },
  },
  {
    id: "GRP-3",
    entry: "RW-GRP-001",
    tier: 1,
    clause:
      "A Call is REQUIRED when grouping removes cards from the traveler's top level (with RW-REV-001)",
    claim: "Every parent with children has exactly one Call",
    run: (ctx) => {
      const parents = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          ctx.records.items.some((child) => child.parentItemId === item.id)
      );
      const calls = ctx.records.reviewQuestions.filter(
        (question) => question.status === "noted"
      );
      const uncalled = parents.filter(
        (parent) =>
          !calls.some(
            (call) =>
              call.subjectId === parent.id ||
              has(call.guessedValue ?? "", parent.title)
          )
      );
      return {
        ok: uncalled.length === 0,
        field:
          "records.items[].parentItemId vs records.reviewQuestions[] where status = 'noted'",
        detail:
          `${parents.length} parent(s), ${calls.length} Call(s); ` +
          (uncalled.length === 0
            ? "each grouping explained"
            : `${uncalled.length} silent grouping(s): ${list(
                uncalled.map((parent) => `"${parent.title}"`)
              )}`),
      };
    },
  },
  {
    id: "GRP-4",
    entry: "RW-GRP-001",
    tier: 1,
    clause:
      "A Call's text is rendered FROM the membership record, never composed alongside it",
    claim:
      "A Call claiming the SOURCE lists N stops is backed by N stops in the container's own description",
    run: (ctx) => {
      // Counting claimed-vs-actual children is NOT the check. Run 8.1.0's Call
      // claimed 7 and the parent owned exactly 7 — the lie was the word
      // "source": `sameSiteClaimText` emits that wording only when
      // `geoChildCount === 0`, i.e. when the code believes every member was
      // placed by the document, while the container's description listed five.
      // The claim must be re-derivable from the container's own text.
      const calls = ctx.records.reviewQuestions.filter(
        (question) => question.status === "noted"
      );
      const wrong = [];
      for (const call of calls) {
        const text = `${call.evidence ?? ""} ${call.prompt ?? ""}`;
        if (!/the source lists/i.test(text)) continue;
        const claimed = Number(/(\d+)\s+stops?/i.exec(text)?.[1]);
        const parent =
          ctx.records.items.find((item) => item.id === call.subjectId) ??
          ctx.records.items.find((item) => has(call.guessedValue ?? "", item.title));
        if (!parent || !Number.isFinite(claimed)) continue;
        const children = ctx.records.items.filter(
          (item) => item.parentItemId === parent.id && item.status !== "ignored"
        );
        const namedInDescription = children.filter((child) =>
          has(parent.description ?? "", child.title)
        );
        if (namedInDescription.length < claimed) {
          wrong.push(
            `"${parent.title}" tells the maker the source lists ${claimed}, but its description names ${namedInDescription.length}` +
              (children.length > namedInDescription.length
                ? ` — unlisted: ${list(
                    children
                      .filter((child) => !namedInDescription.includes(child))
                      .map((child) => `"${child.title}"`),
                    4
                  )}`
                : "")
          );
        }
      }
      const claiming = calls.filter((call) =>
        /the source lists/i.test(`${call.evidence ?? ""} ${call.prompt ?? ""}`)
      );
      if (claiming.length === 0) {
        // Run 8.1.0 reported this PASS with the detail "2 Call(s), 0 claiming
        // source placement" — passing because the thing being checked for did
        // not exist. That is "absent read as zero" (AGENTS.md rule 8(b)), the
        // exact trap this scorecard exists to stop, and it is a defect in its
        // own right: there is nothing here to have judged.
        return {
          state: "NOT_CHECKABLE",
          field:
            "records.reviewQuestions[].evidence (status 'noted') vs parent .description + .parentItemId",
          detail: `${calls.length} Call(s), none claiming source placement — nothing to re-derive against, so this cannot legitimately report PASS`,
        };
      }
      return {
        ok: wrong.length === 0,
        field:
          "records.reviewQuestions[].evidence (status 'noted') vs parent .description + .parentItemId",
        detail:
          `${calls.length} Call(s), ${claiming.length} claiming source placement; ` +
          (wrong.length === 0
            ? "every source claim is re-derivable from the container's own text"
            : `${wrong.length} false statement(s) to the maker: ${list(wrong, 3)}`),
      };
    },
  },
  {
    id: "GRP-5",
    entry: "RW-GRP-001",
    tier: 1,
    clause: "A valid system-created group has at least two named stops",
    claim: "No parent card owns fewer than two children",
    run: (ctx) => {
      const thin = ctx.records.items.filter((item) => {
        if (item.status === "ignored") return false;
        const children = ctx.records.items.filter(
          (child) => child.parentItemId === item.id && child.status !== "ignored"
        );
        return children.length === 1;
      });
      return {
        ok: thin.length === 0,
        field: "records.items[].parentItemId",
        detail:
          thin.length === 0
            ? "no one-child groups"
            : `${thin.length}: ${list(thin.map((item) => `"${item.title}"`))}`,
      };
    },
  },

  // ---------------------------------------------------------------- RW-PLC-001
  {
    id: "PLC-1",
    entry: "RW-PLC-001",
    tier: 1,
    clause: "Synthesized placeholder records are abolished — four homes, no fifth",
    claim: "No record carries `itemType: placeholder`",
    run: (ctx) => {
      const placeholders = ctx.records.items.filter(
        (item) => item.itemType === "placeholder" && item.status !== "ignored"
      );
      return {
        ok: placeholders.length === 0,
        field: "records.items[].itemType + .status",
        detail:
          placeholders.length === 0
            ? "none"
            : `${placeholders.length}: ${list(
                placeholders.map(
                  (item) => `"${item.title}" date=${item.date ?? "null"} leg=${item.legId ?? "null"}`
                )
              )}`,
      };
    },
  },
  {
    id: "PLC-2",
    entry: "RW-PLC-001",
    tier: 1,
    clause:
      "Where a Question's subject was never extracted the Question is dropped and recorded as source coverage, not given a synthesized subject",
    claim: "Every open Question resolves to a real record",
    needs: ["reviewQuestionFields"],
    run: (ctx) => {
      const subjects = new Set([
        ...ctx.records.items.map((item) => item.canonicalId),
        ...ctx.records.stays.map((stay) => stay.canonicalId),
        ...ctx.records.transport.map((row) => row.canonicalId),
        ...ctx.records.legs.map((leg) => leg.canonicalId),
      ]);
      const orphaned = ctx.records.reviewQuestions.filter(
        (question) =>
          question.status === "open" &&
          question.subjectType !== "trip" &&
          !subjects.has(question.subjectCanonicalId)
      );
      return {
        ok: orphaned.length === 0,
        field:
          "records.reviewQuestions[].subjectCanonicalId vs records.{items,stays,transport,legs}[].canonicalId",
        detail:
          orphaned.length === 0
            ? `${ctx.records.reviewQuestions.filter((q) => q.status === "open").length} open Question(s), all anchored`
            : `${orphaned.length} orphaned: ${list(
                orphaned.map((question) => `"${question.prompt}"`)
              )}`,
      };
    },
  },
  {
    id: "PLC-3",
    entry: "RW-PLC-001",
    tier: 1,
    clause:
      "A source-supported Activity with an unresolved date keeps its type and gets a provisional date",
    claim: "No active Activity is dateless",
    run: (ctx) => {
      const dateless = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          item.itemType !== "note" &&
          !item.parentItemId &&
          !item.date
      );
      return {
        ok: dateless.length === 0,
        field: "records.items[].date + .itemType + .status",
        detail:
          dateless.length === 0
            ? "every active Activity is placed"
            : `${dateless.length} stranded: ${list(
                dateless.map((item) => `"${item.title}" (${item.itemType})`)
              )}`,
      };
    },
  },

  // ================================================== TIER 2 — the answer key
  // Spine
  {
    id: "GT-SPINE-1",
    entry: "RW-PLC-001",
    tier: 2,
    clause: "The trip spine is asserted, not derived from itinerary items",
    claim: "5 legs",
    needs: ["legs"],
    gt: () => citation(19, "5 legs, bounded by inter-city travel"),
    run: (ctx) => {
      const legs = ctx.records.legs.filter((leg) => leg.status !== "ignored");
      return {
        ok: legs.length === 5,
        field: "records.legs[].status",
        detail: `${legs.length}: ${list(legs.map((leg) => leg.displayName ?? leg.city ?? "?"))}`,
      };
    },
  },
  {
    id: "GT-SPINE-2",
    entry: "RW-PLC-001",
    tier: 2,
    clause: "One travel card per inter-city segment",
    claim: "8 transport rows",
    gt: () => citation(34, "8 travel cards"),
    run: (ctx) => {
      const transport = ctx.records.transport.filter((row) => row.status !== "ignored");
      return {
        ok: transport.length === 8,
        field: "records.transport[].status",
        detail: `${transport.length}`,
      };
    },
  },
  {
    id: "GT-SPINE-3",
    entry: "RW-PLC-001",
    tier: 2,
    clause: "Every night is covered by a stay or an overnight travel card; no stay is fabricated",
    claim: "5 stays",
    gt: () => citation(69, "The Yellow"),
    run: (ctx) => {
      const stays = ctx.records.stays.filter((stay) => stay.status !== "ignored");
      return {
        ok: stays.length === 5,
        field: "records.stays[].status",
        detail: `${stays.length}: ${list(stays.map((stay) => stay.name ?? stay.title ?? "?"))}`,
      };
    },
  },

  // January 16 — the castle day
  {
    id: "GT-0116-1",
    entry: "RW-ORD-001",
    tier: 2,
    clause: "Invariant A + Invariant B, on the proving case",
    claim: "A dated Jan-16 Prague Castle card exists at the top level",
    gt: () => citation(126, "Prague Castle complex"),
    run: (ctx) => {
      const card = ctx.records.items.find(
        (item) =>
          item.status !== "ignored" &&
          !item.parentItemId &&
          item.date === JAN16 &&
          has(item.title, "prague castle")
      );
      return {
        ok: Boolean(card),
        field: "records.items[].title + .date + .parentItemId",
        detail: card
          ? `"${card.title}" (${card.itemType})`
          : `absent. Jan 16 ships ${ctx.records.items.filter((item) => item.date === JAN16 && item.status !== "ignored" && !item.parentItemId).length} top-level cards, none of them the castle`,
      };
    },
  },
  {
    id: "GT-0116-2",
    entry: "RW-GRP-001",
    tier: 2,
    clause:
      "A timed sub-stop inside a same-site parent stays a child (the fixed guard-changing time within a castle visit)",
    claim: "Changing of the Guard is a CHILD of the castle, not its survivor",
    gt: () => citation(126, "Changing of the Guard"),
    // Membership assertion (2026-08-04 replay: live 7 grouped stops vs replay
    // 14) — payload-only. See header.
    judgeableIn: ["payload", "persisted-qa", "replay"],
    run: (ctx) => {
      const guard = ctx.records.items.find(
        (item) => item.status !== "ignored" && has(item.title, "changing of the guard")
      );
      if (!guard) {
        return {
          ok: false,
          field: "records.items[].title",
          detail: "no Changing of the Guard record at all",
        };
      }
      const parent = ctx.records.items.find((item) => item.id === guard.parentItemId);
      if (parent && has(parent.title, "prague castle")) {
        return {
          ok: true,
          field: "records.items[].parentItemId",
          detail: `child of "${parent.title}"`,
        };
      }
      const absorbedContainer = ctx.report.lineage
        .filter((row) => has(row.title, "changing of the guard"))
        .flatMap((row) => row.actions ?? [])
        .flatMap((action) => action.absorbedTitles ?? [])
        .filter((title) => has(title, "prague castle"));
      return {
        ok: false,
        field: "records.items[].parentItemId + report.lineage[].actions[].absorbedTitles",
        detail: parent
          ? `child of "${parent.title}" instead`
          : absorbedContainer.length > 0
            ? `top-level, and it ABSORBED the container: ${list(
                Array.from(new Set(absorbedContainer)).map((title) => `"${title}"`)
              )}`
            : "top-level and ungrouped",
      };
    },
  },
  {
    id: "GT-0116-3",
    entry: "RW-CLS-001",
    tier: 2,
    clause:
      "A single mention anchored to a meal slot is one untimed Activity with implicit ordering",
    claim: "Trdelník breakfast is exactly ONE Jan-16 card",
    gt: () => citation(123, "Trdel"),
    run: (ctx) => {
      const cards = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          item.date === JAN16 &&
          (has(item.title, "trdelnik") || has(item.title, "trdlnik"))
      );
      return {
        ok: cards.length === 1,
        field: "records.items[].title + .date",
        detail:
          cards.length === 1
            ? `"${cards[0].title}"`
            : `${cards.length}: ${list(cards.map((item) => `"${item.title}"`))}`,
      };
    },
  },
  {
    id: "GT-0116-4",
    entry: "RW-CLS-001",
    tier: 2,
    clause: "Repeated mentions collapse by default; separate occurrences need affirmative evidence",
    claim: "KGB Museum is exactly ONE Jan-16 card",
    gt: () => citation(132, "KGB Museum"),
    run: (ctx) => {
      const cards = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" && item.date === JAN16 && has(item.title, "kgb")
      );
      return {
        ok: cards.length === 1,
        field: "records.items[].title + .date",
        detail: `${cards.length}: ${list(cards.map((item) => `"${item.title}"`))}`,
      };
    },
  },
  {
    id: "GT-0116-5",
    entry: "RW-CLS-001",
    tier: 2,
    clause: "A source doubt marker demotes to City Notes silently, without a Question",
    claim: "R2D2 is a Prague City Note and raises no Question",
    gt: () => citation(139, "R2D2"),
    run: (ctx) => {
      // City Notes ship as one merged per-city record, so "is it a note" means
      // "does the note that shipped contain it", not "is there a card named
      // R2D2". Getting this wrong scored a correct demotion as a failure on
      // the first pass of this scorecard.
      const inNote = has(ctx.noteText, "r2d2");
      const asCard = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          item.itemType !== "note" &&
          has(item.title, "r2d2")
      );
      const routed = ctx.report.lineage.some(
        (row) =>
          has(row.title, "r2d2") &&
          (row.actions ?? []).some((action) => /doubt marker|note collection/i.test(action.reason ?? ""))
      );
      const questions = ctx.records.reviewQuestions.filter(
        (question) => question.status === "open" && has(question.prompt, "r2d2")
      );
      return {
        ok: inNote && asCard.length === 0 && questions.length === 0,
        field:
          "City Note .description + records.items[].itemType + report.lineage[].actions[].reason",
        detail: inNote
          ? `present in the Prague note; ${asCard.length} stray card(s), ${questions.length} Question(s)`
          : routed
            ? "the doubt-marker demotion fired correctly and routed it to the Prague note — but the note that shipped does not contain it. Demoted, then lost."
            : "no R2D2 anywhere in the output",
      };
    },
  },
  {
    id: "GT-0116-6",
    entry: "RW-CLS-001",
    tier: 2,
    clause:
      "Geographic coherence types a flat list as plan-shaped — the tight Malá Strana list is selected activities",
    claim: "Kafka statue, John Lennon Wall and Novy Svet are Jan-16 Activities, not notes",
    gt: () => citation(133, "Kafka statue"),
    run: (ctx) => {
      const wanted = ["kafka", "lennon", "novy svet"];
      const found = wanted.map((token) => ({
        token,
        record: ctx.records.items.find(
          (item) => item.status !== "ignored" && has(item.title, token)
        ),
      }));
      const wrong = found.filter(
        ({ record }) => !record || record.itemType === "note"
      );
      return {
        ok: wrong.length === 0,
        field: "records.items[].itemType + .title",
        detail:
          wrong.length === 0
            ? "all three typed as Activities"
            : `${wrong.length} misfiled: ${list(
                wrong.map(({ token, record }) =>
                  record ? `${token} -> ${record.itemType}` : `${token} -> absent`
                )
              )}`,
      };
    },
  },

  // January 19 — Schönbrunn and the scattered Vienna list
  {
    id: "GT-0119-1",
    entry: "RW-GRP-001",
    tier: 2,
    clause: "Same-site clusters become one parent visit with sub-stops",
    claim: "Schönbrunn owns exactly the five ground-truth sub-stops",
    gt: () => citation(176, "ordered sub-stops"),
    // Membership assertion (2026-08-04 replay: live 7 grouped stops vs replay
    // 14, Schönbrunn alone gaining four unbacked members) — payload-only.
    judgeableIn: ["payload", "persisted-qa", "replay"],
    run: (ctx) => {
      const parent = ctx.records.items.find(
        (item) => item.status !== "ignored" && has(item.title, "schonbrunn")
      );
      if (!parent) {
        return {
          ok: false,
          field: "records.items[].title",
          detail: "no Schönbrunn parent card",
        };
      }
      const children = ctx.records.items.filter(
        (item) => item.parentItemId === parent.id && item.status !== "ignored"
      );
      const expected = [
        "gloriette",
        "orangerie",
        "palm house",
        "strudel",
        "panorama",
      ];
      const matched = expected.filter((token) =>
        children.some((child) => has(child.title, token))
      );
      const extra = children.filter(
        (child) => !expected.some((token) => has(child.title, token))
      );
      return {
        ok: matched.length === expected.length && extra.length === 0,
        field: "records.items[].parentItemId + .title",
        detail: `${children.length} child(ren); ${matched.length}/5 expected present${
          extra.length > 0
            ? `; ${extra.length} unexpected: ${list(extra.map((child) => `"${child.title}"`))}`
            : ""
        }`,
      };
    },
  },
  {
    id: "GT-0119-2",
    entry: "RW-GRP-001",
    tier: 2,
    clause:
      "A mixed-geography list stays individual cards; a non-nested item is never admitted by proximity",
    claim: "Museum of Illusions and Ring Tram Tour are NOT Schönbrunn children",
    gt: () => citation(182, "Museum of Illusions"),
    // Membership assertion. Previously this only went NOT_CHECKABLE when the
    // read came back clean (`wrong.length === 0 && !ctx.geocodeRan`) — docket
    // §6.3's "a replay that shows a clean Schönbrunn group proves nothing
    // about it" — but a DIRTY read in replay is exactly as unreliable: it is
    // still unverified-coordinate grouping, not the policy production ships.
    // Folded into the shared `judgeableIn` mechanism so both directions get
    // the same treatment. Live run 8.1.0 shipped both as children (docket
    // §4a); the 2026-08-04 replay is the general-case evidence (7 vs 14).
    judgeableIn: ["payload", "persisted-qa", "replay"],
    run: (ctx) => {
      const parent = ctx.records.items.find(
        (item) => item.status !== "ignored" && has(item.title, "schonbrunn")
      );
      const wrong = parent
        ? ctx.records.items.filter(
            (item) =>
              item.parentItemId === parent.id &&
              item.status !== "ignored" &&
              (has(item.title, "museum of illusions") || has(item.title, "ring tram"))
          )
        : [];
      return {
        ok: wrong.length === 0,
        field: "records.items[].parentItemId + .title",
        detail:
          wrong.length === 0
            ? "neither is a child"
            : `${wrong.length} wrong member(s): ${list(wrong.map((item) => `"${item.title}"`))}`,
      };
    },
  },
  {
    id: "GT-0119-3",
    entry: "RW-CLS-001",
    tier: 2,
    clause:
      "A scattered flat list is idea-shaped; a source-authored recommendation list belongs in City Notes",
    claim:
      "The scattered Jan-19 Vienna venues are City Notes unless a stronger planned copy wins",
    gt: () => citation(184, "Vienna city notes"),
    run: (ctx) => {
      const ideas = [
        "ferris wheel",
        "hundertwasser",
        "museum of illusions",
        "mozarthaus",
        "ring tram",
        "prater",
        "leopold",
        "st charles",
        "stephen",
      ];
      // Two distinct ways to get this wrong, and they need different fixes:
      // shipping as a card (classification), or being filed to a note that
      // then does not contain it (the note lane losing content).
      const asCard = [];
      const lost = [];
      const promoted = [];
      for (const token of ideas) {
        const plannedElsewhere = ctx.records.items.find(
          (item) =>
            item.status !== "ignored" &&
            item.itemType !== "note" &&
            item.date !== JAN19 &&
            has(item.title, token)
        );
        if (plannedElsewhere) {
          promoted.push(`"${plannedElsewhere.title}" ${plannedElsewhere.date}`);
          continue;
        }
        const record = ctx.records.items.find(
          (item) =>
            item.status !== "ignored" &&
            has(item.title, token) &&
            item.itemType !== "note" &&
            item.date === JAN19
        );
        if (record) {
          asCard.push(`"${record.title}"`);
          continue;
        }
        if (!has(ctx.noteText, token)) lost.push(token);
      }
      const noteCount = ctx.records.items.filter(
        (item) => item.status !== "ignored" && item.itemType === "note"
      ).length;
      return {
        ok: asCard.length === 0 && lost.length === 0,
        field: "records.items[].itemType + .date + .title vs City Note .description",
        detail:
          `${noteCount} City Note(s) trip-wide; ` +
          [
            promoted.length > 0
              ? `${promoted.length} stronger planned copy/copies correctly win: ${list(promoted)}`
              : null,
            asCard.length > 0 ? `${asCard.length} shipped as Activities: ${list(asCard)}` : null,
            lost.length > 0
              ? `${lost.length} reached neither a card nor the note text: ${list(lost)}`
              : null,
            asCard.length === 0 && lost.length === 0
              ? "all non-promoted Jan-19 ideas filed as notes"
              : null,
          ]
            .filter(Boolean)
            .join(" | "),
      };
    },
  },
  {
    id: "GT-0119-4",
    entry: "RW-CLS-001",
    tier: 2,
    clause:
      "Separate source lines without commitment markers remain separate City Note ideas; assembly must not invent a disjunction",
    claim: "Mumok and Natural History remain separate Vienna City Note ideas",
    gt: () => citation(178, "Mumok Museum"),
    run: (ctx) => {
      const cards = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          item.itemType !== "note" &&
          (has(item.title, "mumok") || has(item.title, "natural history"))
      );
      const questions = ctx.records.reviewQuestions.filter(
        (question) =>
          question.status === "open" &&
          (has(question.prompt, "mumok") || has(question.prompt, "natural history"))
      );
      const mumokInNotes = has(ctx.noteText, "mumok");
      const naturalHistoryInNotes = has(ctx.noteText, "natural history");
      return {
        ok:
          cards.length === 0 &&
          questions.length === 0 &&
          mumokInNotes &&
          naturalHistoryInNotes,
        field: "City Note .description vs records.items[] + records.reviewQuestions[]",
        detail: `${mumokInNotes && naturalHistoryInNotes ? "both separate source ideas are in City Notes" : "one or both source ideas are missing from City Notes"}; ${cards.length} Activity card(s); ${questions.length} open Question(s)`,
      };
    },
  },

  // January 20 — the tight-cluster control
  {
    id: "GT-0120-1",
    entry: "RW-CLS-001",
    tier: 2,
    clause:
      "A short, deliberate, tightly clustered list is selected untimed Activities (the control for GT-0119-3)",
    claim: "The five Jan-20 Innere Stadt venues are Activities",
    gt: () => citation(190, "Cafe Central"),
    run: (ctx) => {
      const wanted = ["cafe central", "jewish museum", "stephen", "library", "kunstforum"];
      const misfiled = [];
      for (const token of wanted) {
        const record = ctx.records.items.find(
          (item) =>
            item.status !== "ignored" && item.date === JAN20 && has(item.title, token)
        );
        if (!record) misfiled.push(`${token} -> absent from Jan 20`);
        else if (record.itemType === "note") misfiled.push(`"${record.title}" -> note`);
      }
      return {
        ok: misfiled.length === 0,
        field: "records.items[].itemType + .date + .title",
        detail:
          misfiled.length === 0
            ? "all five ship as Jan-20 Activities"
            : `${misfiled.length} wrong: ${list(misfiled)}`,
      };
    },
  },
  {
    id: "GT-0120-2",
    entry: "RW-GRP-001",
    tier: 2,
    clause:
      "Group members must be the same KIND of thing — an errand is not a sightseeing stop",
    claim: "Laundry is a standalone Jan-20 Activity, not a group child",
    gt: () => citation(192, "Laundry"),
    // Membership assertion — whether laundry got pulled into a group at all
    // (2026-08-04 replay: live 7 grouped stops vs replay 14) — payload-only.
    judgeableIn: ["payload", "persisted-qa", "replay"],
    run: (ctx) => {
      const laundry = ctx.records.items.find(
        (item) => item.status !== "ignored" && has(item.title, "laundry")
      );
      return {
        ok: Boolean(laundry) && !laundry.parentItemId && laundry.itemType !== "note",
        field: "records.items[].parentItemId + .itemType",
        detail: laundry
          ? `"${laundry.title}" type=${laundry.itemType} parent=${laundry.parentItemId ?? "none"}`
          : "absent",
      };
    },
  },
  {
    id: "GT-0120-3",
    entry: "RW-CLS-001",
    tier: 2,
    clause:
      "A stronger planned sighting gives the entity one Activity home and removes its City Note duplicate",
    claim: "St. Stephen's and the Library keep the Jan-20 card and lose the Jan-19 note copy",
    gt: () => citation(193, "the Jan 20"),
    run: (ctx) => {
      const problems = [];
      for (const token of ["stephen", "library"]) {
        const all = ctx.records.items.filter(
          (item) => item.status !== "ignored" && has(item.title, token)
        );
        const viennaCopies = all.filter(
          (item) => item.date === JAN19 || item.date === JAN20 || !item.date
        );
        const cards = viennaCopies.filter((item) => item.itemType !== "note");
        const notes = viennaCopies.filter((item) => item.itemType === "note");
        if (cards.length !== 1 || notes.length !== 0) {
          problems.push(`${token}: ${cards.length} card(s), ${notes.length} note copy(ies)`);
        }
      }
      return {
        ok: problems.length === 0,
        field: "records.items[].itemType + .date + .title",
        detail:
          problems.length === 0
            ? "one home each, note copies removed"
            : list(problems),
      };
    },
  },
];

// Complete beta-candidate ground truth. The older table above is retained so
// historical trend lines remain comparable; this section is the hard gate.
const activeTopLevelItemsForDate = (ctx, date) =>
  ctx.records.items.filter(
    (item) =>
      item.status !== "ignored" &&
      item.itemType !== "note" &&
      !item.parentItemId &&
      item.date === date
  );

const matchesAnyTitle = (record, alternatives) =>
  alternatives.some((alternative) => has(record.title, alternative));

function exactDayAssertion({ date, expected, gtLine, gtPhrase, id }) {
  return {
    id,
    entry: "RW-ASM-001",
    tier: 2,
    clause:
      "Every day section preserves exactly the intended traveler-visible top-level homes",
    claim: `${date} has the exact intended top-level Activity structure`,
    gt: () => citation(gtLine, gtPhrase),
    run: (ctx) => {
      const actual = activeTopLevelItemsForDate(ctx, date);
      const matchedIds = new Set();
      const missing = [];
      const duplicates = [];
      for (const expectation of expected) {
        const matches = actual.filter((item) =>
          matchesAnyTitle(item, expectation.alternatives)
        );
        if (matches.length === 0) missing.push(expectation.label);
        if (matches.length > 1) duplicates.push(expectation.label);
        for (const match of matches) matchedIds.add(match.id);
      }
      const extras = actual.filter((item) => !matchedIds.has(item.id));
      const ok =
        missing.length === 0 &&
        duplicates.length === 0 &&
        extras.length === 0 &&
        actual.length === expected.length;
      return {
        ok,
        field:
          "records.items[].date/.itemType/.parentItemId/.title (exact top-level set)",
        detail: ok
          ? `${expected.length} exact top-level home(s)`
          : [
              missing.length ? `missing: ${list(missing)}` : null,
              duplicates.length ? `duplicated: ${list(duplicates)}` : null,
              extras.length
                ? `extra: ${list(extras.map((item) => `"${item.title}"`), 12)}`
                : null,
            ]
              .filter(Boolean)
              .join(" | "),
      };
    },
  };
}

const dayExpectation = (label, ...alternatives) => ({ alternatives, label });
ASSERTIONS.push(
  exactDayAssertion({ id: "DAY-0112", date: `${Y}-01-12`, expected: [], gtLine: 85, gtPhrase: "No activities" }),
  exactDayAssertion({
    id: "DAY-0113",
    date: `${Y}-01-13`,
    expected: [
      dayExpectation("Colosseum", "colosseum"),
      dayExpectation("Pantheon", "pantheon"),
      dayExpectation("Trevi Fountain", "trevi"),
      dayExpectation("Spanish Steps", "spanish steps"),
    ],
    gtLine: 95,
    gtPhrase: "4 individual",
  }),
  exactDayAssertion({
    id: "DAY-0114",
    date: `${Y}-01-14`,
    expected: [
      dayExpectation("Charles Bridge", "charles bridge"),
      dayExpectation("Astronomical Clock", "astronomical clock"),
      dayExpectation("Lucerna Arcade", "lucerna"),
      dayExpectation("Dancing House", "dancing house"),
      dayExpectation("Catacombs tour", "catacombs"),
      dayExpectation("Hemingway Bar", "hemingway"),
    ],
    gtLine: 102,
    gtPhrase: "Charles Bridge",
  }),
  exactDayAssertion({
    id: "DAY-0115",
    date: `${Y}-01-15`,
    expected: [
      dayExpectation("Old Town and Jewish Quarter Hidden Secrets", "hidden secrets"),
      dayExpectation("Klementinum guided tour", "klementinum"),
      dayExpectation("Bellevue dinner", "bellevue"),
    ],
    gtLine: 115,
    gtPhrase: "Old Town and Jewish Quarter Hidden Secrets",
  }),
  exactDayAssertion({
    id: "DAY-0116",
    date: `${Y}-01-16`,
    expected: [
      dayExpectation("Trdelnik breakfast", "trdelnik", "trdlnik"),
      dayExpectation("Prague Castle", "prague castle"),
      dayExpectation("U Maliru", "u maliru"),
      dayExpectation("KGB Museum", "kgb"),
      dayExpectation("Mala Strana and Hradcany walk", "mala strana", "hrad any walk"),
    ],
    gtLine: 147,
    gtPhrase: "5 cards",
  }),
  exactDayAssertion({
    id: "DAY-0117",
    date: `${Y}-01-17`,
    expected: [
      dayExpectation("Pick up rental car", "pick up car", "pick up rental"),
      dayExpectation("Sedlec Ossuary", "sedlec"),
      dayExpectation("Church of St. Barbara", "st barbara", "saint barbara"),
      dayExpectation("Silver mines", "silver mine"),
      dayExpectation("Koscom watch shop", "koscom"),
    ],
    gtLine: 151,
    gtPhrase: "5 activities",
  }),
  exactDayAssertion({
    id: "DAY-0118",
    date: `${Y}-01-18`,
    expected: [
      dayExpectation("Pick up Vienna Card", "vienna card"),
      dayExpectation("Albertina", "albertina"),
    ],
    gtLine: 167,
    gtPhrase: "Vienna Card",
  }),
  exactDayAssertion({
    id: "DAY-0119",
    date: `${Y}-01-19`,
    expected: [dayExpectation("Schonbrunn Palace visit", "schonbrunn")],
    gtLine: 176,
    gtPhrase: "Schönbrunn Palace visit",
  }),
  exactDayAssertion({
    id: "DAY-0120",
    date: `${Y}-01-20`,
    expected: [
      dayExpectation("Cafe Central", "cafe central"),
      dayExpectation("Jewish Museum", "jewish museum"),
      dayExpectation("St. Stephen's Cathedral", "stephen"),
      dayExpectation("Library", "library"),
      dayExpectation("Bank Austria Kunstforum", "kunstforum"),
      dayExpectation("Laundry", "laundry"),
    ],
    gtLine: 192,
    gtPhrase: "Laundry",
  }),
  exactDayAssertion({ id: "DAY-0121", date: `${Y}-01-21`, expected: [], gtLine: 199, gtPhrase: "Gellert Baths" }),
  exactDayAssertion({
    id: "DAY-0122",
    date: `${Y}-01-22`,
    expected: [
      dayExpectation("Fisherman's Bastion", "fisherman"),
      dayExpectation("Matthias Church", "matthias"),
      dayExpectation("Castle Hill", "castle hill", "buda castle"),
      dayExpectation("Szechenyi Chain Bridge", "chain bridge"),
      dayExpectation("St. Istvan's Basilica", "istvan", "st stephen basilica"),
      dayExpectation("Vorosmarty Ter", "vorosmarty"),
      dayExpectation("Shoes on the Danube", "shoes on the danube"),
      dayExpectation("Parliament", "parliament"),
      dayExpectation("Great Market Hall", "market hall"),
      dayExpectation("Borkonyha Wine Kitchen", "borkonyha"),
    ],
    gtLine: 209,
    gtPhrase: "Fisherman",
  }),
  exactDayAssertion({
    id: "DAY-0123",
    date: `${Y}-01-23`,
    expected: [
      dayExpectation("House of Terror Museum", "house of terror"),
      dayExpectation("New York Cafe", "new york cafe"),
      dayExpectation("Baths slot", "bath"),
      dayExpectation("St. Stephen's Basilica tower", "tower"),
    ],
    gtLine: 225,
    gtPhrase: "House of Terror",
  }),
  exactDayAssertion({
    id: "DAY-0124",
    date: `${Y}-01-24`,
    expected: [
      dayExpectation("Watches in Rome", "watches"),
      dayExpectation("Tour Rome", "tour rome"),
    ],
    gtLine: 239,
    gtPhrase: "Watches in Rome",
  }),
  exactDayAssertion({ id: "DAY-0125", date: `${Y}-01-25`, expected: [], gtLine: 248, gtPhrase: "Travel only" })
);

function cityNoteText(ctx, city) {
  const fromRecords = ctx.records.items
    .filter(
      (item) =>
        item.status !== "ignored" &&
        item.itemType === "note" &&
        has(item.cityNoteKey ?? item.title, city)
    )
    .map((item) => `${item.title} ${item.description ?? ""}`);
  const fromFingerprints = (ctx.report.fingerprints?.activeNotes ?? []).filter(
    (entry) => has(String(entry).split("|")[0], city)
  );
  return [...fromRecords, ...fromFingerprints].join(" ");
}

function cityNoteAssertion({ city, forbidden = [], required }) {
  return {
    id: `NOTES-${city.toUpperCase()}`,
    entry: "RW-ASM-001",
    tier: 1,
    clause: "Every city has one complete, durable, city-keyed note home",
    claim: `${city} City Notes contain every required idea and no displaced planned item`,
    run: (ctx) => {
      const surface = cityNoteText(ctx, city);
      const missing = required.filter((token) => !has(surface, token));
      const misplaced = forbidden.filter((token) => has(surface, token));
      return {
        ok: Boolean(surface) && missing.length === 0 && misplaced.length === 0,
        field: "records.items City Note text + report.fingerprints.activeNotes",
        detail:
          missing.length === 0 && misplaced.length === 0
            ? `${required.length} required idea(s) present; no forbidden home`
            : [
                missing.length ? `missing: ${list(missing, 14)}` : null,
                misplaced.length ? `wrongly retained: ${list(misplaced, 14)}` : null,
              ]
                .filter(Boolean)
                .join(" | "),
      };
    },
  };
}

ASSERTIONS.push(
  cityNoteAssertion({
    city: "prague",
    required: ["communism", "country life", "mistral", "malostranska beseda", "cafe louvre", "garlic", "onion soup", "r2d2", "peklo", "u fleku", "u medvidku", "u pinkasu"],
    forbidden: ["koscom", "laundry"],
  }),
  cityNoteAssertion({
    city: "vienna",
    required: ["mumok", "natural history", "ferris wheel", "hundertwasser", "museum of illusions", "mozarthaus", "ring tram", "prater", "leopold", "st charles"],
    forbidden: ["laundry", "albertina"],
  }),
  cityNoteAssertion({
    city: "budapest",
    required: ["huf", "gypsy music", "great synagogue", "pinball", "konyv", "mazel tov", "hilton", "ruszwurm", "vaci", "comme chez soi", "smart kitchen", "bors", "szimpla", "dohany", "children s train", "public transport", "pontoon", "hospital in the rock", "balthazar", "pest buda", "pomodoro", "menza", "zona", "aranykaviar", "retro langos", "karavan"],
    forbidden: ["thermal baths"],
  })
);

function persistedGroupedSortOrder(ctx, child) {
  const row = (ctx.report.fingerprints?.groupedStops ?? []).find((entry) =>
    has(String(entry).split("|")[3], child.title)
  );
  return row ? Number(String(row).split("|")[1]) : child.sortOrder;
}

function exactGroupAssertion({ id, parentAlternatives, date, children, callPolicy }) {
  return {
    id,
    entry: "RW-GRP-001",
    tier: 1,
    clause: "Grouping consumes the frozen containment and identity ledgers exactly once",
    claim: `${id} has exact ordered membership and the declared Call policy`,
    run: (ctx) => {
      const parent = ctx.records.items.find(
        (item) =>
          item.status !== "ignored" &&
          item.date === date &&
          !item.parentItemId &&
          matchesAnyTitle(item, parentAlternatives)
      );
      if (!parent) {
        return { ok: false, field: "records.items[].parentItemId/.sortOrder", detail: "parent absent" };
      }
      const actual = ctx.records.items
        .filter((item) => item.status !== "ignored" && item.parentItemId === parent.id)
        .sort((left, right) => persistedGroupedSortOrder(ctx, left) - persistedGroupedSortOrder(ctx, right));
      const expectedLabels = children.map((child) => child.label);
      const actualLabels = actual.map((item) => {
        const match = children.find((child) => matchesAnyTitle(item, child.alternatives));
        return match?.label ?? `unexpected:${item.title}`;
      });
      const calls = ctx.records.reviewQuestions.filter(
        (question) =>
          question.status === "noted" &&
          (question.subjectId === parent.id || has(question.guessedValue ?? question.evidence, parent.title))
      );
      const membershipOk =
        actualLabels.length === expectedLabels.length &&
        actualLabels.every((label, index) => label === expectedLabels[index]);
      const callsOk = callPolicy === "required" ? calls.length === 1 : calls.length === 0;
      return {
        ok: membershipOk && callsOk,
        field: "records.items[].parentItemId + persisted groupedStops sort + review Calls",
        detail: `children [${actualLabels.join(" -> ")}]; Calls ${calls.length} (expected ${callPolicy})`,
      };
    },
  };
}

ASSERTIONS.push(
  exactGroupAssertion({
    id: "GROUP-TOUR",
    date: `${Y}-01-15`,
    parentAlternatives: ["hidden secrets"],
    children: [
      dayExpectation("Old Town Square", "old town square"),
      dayExpectation("Jewish Quarter", "jewish quarter", "josefov"),
    ],
    callPolicy: "silent",
  }),
  exactGroupAssertion({
    id: "GROUP-CASTLE",
    date: `${Y}-01-16`,
    parentAlternatives: ["prague castle"],
    children: [
      dayExpectation("Changing of the Guard", "changing of the guard"),
      dayExpectation("St. Vitus Cathedral", "st vitus"),
    ],
    callPolicy: "required",
  }),
  exactGroupAssertion({
    id: "GROUP-MALA",
    date: `${Y}-01-16`,
    parentAlternatives: ["mala strana", "hrad any walk"],
    children: [
      dayExpectation("Kafka statue", "kafka"),
      dayExpectation("John Lennon Wall", "lennon"),
      dayExpectation("Vinarna Certovka", "certovka"),
      dayExpectation("Novy svet", "novy svet"),
    ],
    callPolicy: "required",
  }),
  exactGroupAssertion({
    id: "GROUP-SCHONBRUNN",
    date: `${Y}-01-19`,
    parentAlternatives: ["schonbrunn"],
    children: [
      dayExpectation("Gloriette", "gloriette"),
      dayExpectation("Orangeriegarten", "orangerie"),
      dayExpectation("Palm House", "palm house"),
      dayExpectation("Apple Strudel Show", "strudel"),
      dayExpectation("Panorama Train", "panorama"),
    ],
    callPolicy: "required",
  })
);

ASSERTIONS.push(
  {
    id: "SYNTAX-DISJUNCTION-BOUNDARY",
    entry: "RW-QA-001",
    tier: 1,
    clause:
      "Parser syntax repair requires one bounded local source span that names both alternatives",
    claim:
      "Colosseum/The Yellow and Palm House/Museum of Illusions remain separate entities",
    run: (ctx) => {
      const activeItems = ctx.records.items.filter(
        (item) => item.status !== "ignored"
      );
      const fused = activeItems.filter(
        (item) =>
          (has(item.title, "colosseum") && has(item.title, "the yellow")) ||
          (has(item.title, "palm house") &&
            has(item.title, "museum of illusions"))
      );
      const colosseum = activeItems.filter(
        (item) => item.itemType !== "note" && has(item.title, "colosseum")
      );
      const yellowStay = ctx.records.stays.filter(
        (stay) => stay.status !== "ignored" && has(stay.name ?? stay.title, "the yellow")
      );
      const palmHouse = activeItems.filter((item) =>
        has(item.title, "palm house")
      );
      const exactLineageTitles = new Set(
        (ctx.report.lineage ?? []).map((row) => norm(row.title))
      );
      const fusedLineage = (ctx.report.lineage ?? []).filter(
        (row) =>
          (has(row.title, "colosseum") && has(row.title, "the yellow")) ||
          (has(row.title, "palm house") &&
            has(row.title, "museum of illusions"))
      );
      const fourSeparateLineageRows = [
        "colosseum",
        "the yellow",
        "palm house at schonbrunn",
        "museum of illusions",
      ].every((title) => exactLineageTitles.has(norm(title)));
      return {
        ok:
          fused.length === 0 &&
          fusedLineage.length === 0 &&
          colosseum.length === 1 &&
          yellowStay.length === 1 &&
          palmHouse.length === 1 &&
          fourSeparateLineageRows,
        field: "records.items/stays + report.lineage exact source entities",
        detail:
          `active fused=${fused.length}; fused lineage=${fusedLineage.length}; ` +
          `Colosseum=${colosseum.length}; Yellow stay=${yellowStay.length}; ` +
          `Palm House=${palmHouse.length}; four exact source rows=${fourSeparateLineageRows}`,
      };
    },
  },
  {
    id: "IDENTITY-PINBALL",
    entry: "RW-CAN-001",
    tier: 1,
    clause: "Repeated uncommitted mentions have one City Note home",
    claim: "Pinball Museum has one Budapest-note home and no Activity card",
    run: (ctx) => {
      const cards = ctx.records.items.filter((item) => item.status !== "ignored" && item.itemType !== "note" && has(item.title, "pinball"));
      return { ok: cards.length === 0 && has(cityNoteText(ctx, "budapest"), "pinball"), field: "records.items + Budapest City Note", detail: `${cards.length} Activity card(s); note=${has(cityNoteText(ctx, "budapest"), "pinball")}` };
    },
  },
  {
    id: "IDENTITY-MARKET-HALL",
    entry: "RW-CAN-001",
    tier: 1,
    clause: "The stronger planned copy wins and receives every useful fact",
    claim: "Great Market Hall has exactly one Jan-22 Activity home",
    run: (ctx) => {
      const rows = ctx.records.items.filter((item) => item.status !== "ignored" && item.itemType !== "note" && has(item.title, "market hall"));
      return { ok: rows.length === 1 && rows[0].date === `${Y}-01-22`, field: "records.items[].title/.date", detail: `${rows.length}: ${list(rows.map((item) => `${item.title} ${item.date}`))}` };
    },
  },
  {
    id: "IDENTITY-BASILICA",
    entry: "RW-CAN-001",
    tier: 1,
    clause: "Venue aliases merge while a separately planned tower visit stays distinct",
    claim: "One Jan-22 basilica venue and one distinct Jan-23 tower remain",
    run: (ctx) => {
      const jan22 = activeTopLevelItemsForDate(ctx, `${Y}-01-22`).filter((item) => has(item.title, "istvan") || has(item.title, "stephen"));
      const jan23 = activeTopLevelItemsForDate(ctx, `${Y}-01-23`).filter((item) => has(item.title, "tower"));
      return { ok: jan22.length === 1 && jan23.length === 1, field: "records.items[].title/.date", detail: `Jan 22 basilica=${jan22.length}; Jan 23 tower=${jan23.length}` };
    },
  },
  {
    id: "DEBRIS-ZERO",
    entry: "RW-CLS-001",
    tier: 1,
    clause: "Admin, accessory, note, and generic label material cannot become Activities",
    claim: "Known production debris creates no traveler Activity card",
    run: (ctx) => {
      const debris = ["explore rome", "30 minute walk", "payment due", "wi fi", "return", "buy wine", "great synagogue", "pinball museum"];
      const bad = ctx.records.items.filter((item) => item.status !== "ignored" && item.itemType !== "note" && debris.some((token) => has(item.title, token)));
      const genericEat = ctx.records.items.filter((item) => item.status !== "ignored" && item.itemType !== "note" && norm(item.title) === "eat");
      return { ok: bad.length + genericEat.length === 0, field: "records.items[].itemType/.title", detail: bad.length + genericEat.length === 0 ? "no known debris Activity" : list([...bad, ...genericEat].map((item) => `"${item.title}"`), 16) };
    },
  },
  {
    id: "CONSERVATION-DISPOSITIONS",
    entry: "RW-EVD-001",
    tier: 1,
    clause: "Every meaningful observation has exactly one durable final disposition",
    claim: "The canonicalization report has zero undisposed observations",
    run: (ctx) => {
      const count = ctx.report.canonicalization?.undisposedObservationCount;
      return { ok: count === 0, field: "report.canonicalization.undisposedObservationCount", detail: `${count ?? "missing"}` };
    },
  },
  {
    id: "PRIVACY-PUBLIC-ZERO",
    entry: "RW-PRI-001",
    tier: 1,
    clause: "No protected-class value survives the final public projection",
    claim: "Public City Note protected-value count is zero",
    run: (ctx) => {
      const fingerprintModule = require2(path.join(rootDir, "lib/extraction/assembly-semantic-fingerprint.ts"));
      const count = fingerprintModule.countPublicProtectedCityNoteSegments(ctx.records);
      return { ok: count === 0, field: "final records.items City Note public descriptions", detail: `${count} protected-class segment(s)` };
    },
  },
  {
    id: "QUESTIONS-EXACT",
    entry: "RW-QUE-001",
    tier: 1,
    clause: "Questions ask only unresolved material maker decisions",
    claim: "Exactly the Castle ticket, Vienna Friday list, and baths Questions remain",
    run: (ctx) => {
      const open = ctx.records.reviewQuestions.filter((question) => question.status === "open");
      const text = (question) => `${question.prompt ?? ""} ${question.reason ?? ""} ${(question.answerOptions ?? []).map((option) => `${option.label} ${option.value}`).join(" ")}`;
      const castle = open.filter((question) => has(text(question), "castle") && has(text(question), "ticket"));
      const vienna = open.filter((question) => has(text(question), "state hall") && has(text(question), "time travel") && has(text(question), "belvedere") && !has(text(question), "albertina"));
      const baths = open.filter((question) => has(text(question), "gellert") && has(text(question), "szechenyi"));
      return { ok: open.length === 3 && castle.length === 1 && vienna.length === 1 && baths.length === 1, field: "records.reviewQuestions open prompts/reasons/options", detail: `${open.length} open; Castle=${castle.length}, Vienna=${vienna.length}, baths=${baths.length}` };
    },
  },
  {
    id: "CALLS-EXACT",
    entry: "RW-REV-001",
    tier: 1,
    clause: "Calls truthfully describe completed visible grouping actions",
    claim: "Exactly Castle, Mala Strana, and Schonbrunn grouping Calls remain",
    run: (ctx) => {
      const calls = ctx.records.reviewQuestions.filter((question) => question.status === "noted");
      const text = calls.map((question) => `${question.prompt ?? ""} ${question.reason ?? ""} ${question.evidence ?? ""} ${question.guessedValue ?? ""}`).join(" | ");
      const wanted = ["prague castle", "mala strana", "schonbrunn"];
      const matched = wanted.filter((token) => has(text, token));
      const tourCall = calls.some((question) => has(`${question.prompt} ${question.reason} ${question.evidence}`, "hidden secrets"));
      return { ok: calls.length === 3 && matched.length === 3 && !tourCall, field: "records.reviewQuestions noted prompt/reason/evidence", detail: `${calls.length} Calls; required subjects ${matched.length}/3; tour Call=${tourCall}` };
    },
  },
  {
    id: "QA-P0-P1-ZERO",
    entry: "RW-QA-001",
    tier: 1,
    clause: "Independent semantic QA reports no unresolved P0/P1 defect on the candidate",
    claim: "Final quality report has zero P0/P1 diagnostics",
    run: (ctx) => {
      const serious = (ctx.report.diagnostics ?? []).filter((diagnostic) => {
        const severity = String(diagnostic.severity ?? "").toLowerCase();
        return severity === "p0" || severity === "p1";
      });
      return { ok: serious.length === 0, field: "report.diagnostics[].severity", detail: `${serious.length} P0/P1 finding(s): ${list(serious.map((diagnostic) => diagnostic.code), 12)}` };
    },
  },
  {
    id: "AUD-DETECTOR-ZERO",
    entry: "RW-AUD-001",
    tier: 1,
    clause: "Detector findings require independent source/canonical/final reconciliation",
    claim: "No unresolved detector incident remains",
    run: (ctx) => {
      const incidents = ctx.report.detectorIncidents ?? [];
      return { ok: incidents.length === 0, field: "report.detectorIncidents[]", detail: `${incidents.length} incident(s)` };
    },
  }
);

// ===========================================================================
// RUNNER
// ===========================================================================

function evaluate(assertion, ctx) {
  const entryEnforcement = ledgerEnforcement.get(assertion.entry) ?? "(missing)";
  const missing = (assertion.needs ?? []).filter((need) => ctx.absent.has(need));
  if (missing.length > 0) {
    return {
      id: assertion.id,
      entry: assertion.entry,
      tier: assertion.tier,
      clause: assertion.clause,
      claim: assertion.claim,
      gt: assertion.gt ? assertion.gt() : null,
      enforcement: entryEnforcement,
      state: "NOT_CHECKABLE",
      field: `(${missing.join(", ")} is not carried by the ${ctx.source} input)`,
      detail: `this surface exists in the other input mode; re-run there to score it`,
      findings: [],
    };
  }
  // `judgeableIn` mirrors `needs`/`absent` above. Replay now pins production's
  // saved geocode outputs, so grouping assertions include both "payload" and
  // "replay". This guard remains fail-closed for any future input surface that
  // carries records without the matching verification lane.
  if (assertion.judgeableIn && !assertion.judgeableIn.includes(ctx.source)) {
    return {
      id: assertion.id,
      entry: assertion.entry,
      tier: assertion.tier,
      clause: assertion.clause,
      claim: assertion.claim,
      gt: assertion.gt ? assertion.gt() : null,
      enforcement: entryEnforcement,
      state: "NOT_CHECKABLE",
      field: `(group membership is not judgeable in the ${ctx.source} input)`,
      detail:
        "this input does not prove it carries the matching completed geocode lane; use payload or " +
        "the pinned replay to score this.",
      findings: [],
    };
  }
  const result = {
    id: assertion.id,
    entry: assertion.entry,
    tier: assertion.tier,
    clause: assertion.clause,
    claim: assertion.claim,
    gt: assertion.gt ? assertion.gt() : null,
    enforcement: entryEnforcement,
    state: "PASS",
    field: "",
    detail: "",
    findings: [],
  };

  if (assertion.notBuilt) {
    const hits = probeSource(assertion.notBuilt.probe);
    if (hits.length === 0) {
      result.state = "NOT_BUILT";
      result.field = `(probe ${assertion.notBuilt.probe} matched nothing under ${PROBE_ROOTS.join("/")})`;
      result.detail = assertion.notBuilt.reason;
      if (entryEnforcement === "ENFORCED" || entryEnforcement === "PARTIAL") {
        result.findings.push({
          kind: "ledger",
          text:
            `${assertion.entry} claims \`Enforcement: ${entryEnforcement}\` while ${assertion.id} ` +
            `("${assertion.claim}") has no implementation. The ledger is overstating its own coverage.`,
        });
      }
      return result;
    }
    result.findings.push({
      kind: "stale-declaration",
      text:
        `${assertion.id} is declared NOT_BUILT, but the probe found an implementation in ` +
        `${list(hits, 4)}. The declaration is stale; the assertion was evaluated instead.`,
    });
  }

  let outcome;
  try {
    outcome = assertion.run(ctx);
  } catch (error) {
    result.state = "NOT_CHECKABLE";
    result.field = "(threw)";
    result.detail = `assertion threw: ${error?.message ?? error}`;
    return result;
  }
  result.state = outcome.state ?? (outcome.ok ? "PASS" : "FAIL");
  result.field = outcome.field ?? "";
  result.detail = outcome.detail ?? "";
  return result;
}

// The live audit payload carries `report` but not `records`. Everything the
// assertions read is reconstructed from surfaces the payload DOES carry, and
// anything that cannot be is declared absent rather than defaulted — an absent
// surface silently reading as empty is the exact failure this whole scorecard
// exists to stop ("ABSENT IS NOT ZERO", AGENTS.md rule 8(b)).
function recordsFromPayload(report) {
  const seen = new Map();
  for (const row of report.lineage ?? []) {
    for (const final of row.finalRecords ?? []) {
      if (!seen.has(final.id)) seen.set(final.id, final);
    }
  }
  const all = [...seen.values()];

  // Parent links live only in the fingerprint block, as
  // joinKey([parentItemId, sortOrder, date, title, ...]).
  const parentByChildTitle = new Map();
  for (const entry of report.fingerprints?.groupedStops ?? []) {
    const parts = String(entry).split("|");
    if (parts.length < 4) continue;
    parentByChildTitle.set(norm(parts[3]), parts[0]);
  }
  // The fingerprint's parent id is normalized (punctuation stripped), so join
  // back to the real record id through the same normalization.
  const idByNormalized = new Map(all.map((record) => [norm(record.id), record.id]));

  const items = all
    .filter((record) => record.recordType === "item")
    .map((record) => ({
      canonicalId: record.canonicalId,
      cityNoteKey: record.cityNoteKey,
      date: record.date,
      description: record.description,
      endTime: record.endTime,
      id: record.id,
      itemType: record.type ?? "activity",
      legId: record.legId,
      parentItemId:
        idByNormalized.get(norm(parentByChildTitle.get(norm(record.title)) ?? "")) ??
        null,
      startTime: record.startTime,
      status: record.status,
      title: record.title,
    }));

  // Calls survive as fingerprint rows:
  // joinKey([subjectType, targetField, guessedValue, reason, prompt, ...]).
  const reviewQuestions = (report.fingerprints?.calls ?? []).map((entry) => {
    const parts = String(entry).split("|");
    return {
      evidence: parts[3] ?? "",
      guessedValue: parts[2] ?? "",
      prompt: parts[4] ?? "",
      status: "noted",
      subjectCanonicalId: "",
      subjectId: "",
      subjectType: parts[0] ?? "item",
      targetField: parts[1] ?? null,
    };
  });

  return {
    items,
    legs: [],
    reviewQuestions,
    stays: all.filter((record) => record.recordType === "stay"),
    transport: all.filter((record) => record.recordType === "transport"),
  };
}

function contextFromPayload(payload) {
  const report = payload.report;
  if (!report) throw new Error("payload carries no report — is this the right trip?");
  const records = recordsFromPayload(report);
  const ctx = buildContext({ records, report, pieces: [], assembly: null });
  ctx.source = "payload";
  // Named, not silently empty. `legs` is genuinely absent from the payload;
  // review-question identity fields survive only as fingerprint text.
  ctx.absent = new Set(["legs", "reviewQuestionFields"]);
  return ctx;
}

function contextFromQaBundle(
  bundle,
  auditPayload = null,
  { historicalProjection = true } = {}
) {
  if (!bundle?.records || !bundle?.audit) {
    throw new Error(
      "QA bundle carries no records/audit surface — is this the persisted bundle?"
    );
  }
  const review = bundle.records.review ?? {};
  const fullReport = auditPayload?.report ?? null;
  const report = fullReport
    ? fullReport
    : {
        ...bundle.audit,
        detectorIncidents: bundle.audit.detectorIncidents ?? [],
        lineage: bundle.audit.lineage?.rows ?? [],
      };
  const records = {
    items: bundle.records.items ?? [],
    legs: bundle.records.legs ?? [],
    privateDetails: bundle.records.privateDetails ?? [],
    reviewQuestions: [
      ...(review.calls ?? []),
      ...(review.openQuestions ?? []),
      ...(review.dismissedQuestions ?? []),
    ],
    stays: bundle.records.stays ?? [],
    transport: bundle.records.transport ?? [],
    trip: bundle.records.trip ?? {},
  };
  const ctx = buildContext({ records, report, pieces: [], assembly: null });
  ctx.source = "persisted-qa";
  // Historical QA projection v1 did not serve these fields. They are named
  // explicitly so no scorer can reconstruct them from titles, ids, or prose.
  // The current QA projection serves them for every new run.
  ctx.absent = historicalProjection
    ? new Set(["itemSortOrder", "reviewAnswerOptions"])
    : new Set();
  return ctx;
}

function buildContext({ records, report, pieces, assembly }) {
  const geocodeRan = report.lineage.some((row) =>
    row.observations.some((observation) => observation.verifiedLatitude != null)
  );
  // Every title any surviving record absorbed, so Invariant A can tell
  // "suppressed as a duplicate of a survivor" (permitted) from "deleted"
  // (forbidden).
  const carriers = new Set();
  for (const row of report.lineage) {
    if (row.status === "suppressed" && row.finalRecords.length === 0) continue;
    for (const action of row.actions ?? []) {
      for (const absorbed of action.absorbedTitles ?? []) carriers.add(norm(absorbed));
    }
  }
  // Everything the City Notes actually SHIPPED, as one searchable blob. A
  // record routed into a note whose text does not contain it was not filed —
  // it was lost, and the lineage says otherwise.
  const noteText = records.items
    .filter((item) => item.itemType === "note" && item.status !== "ignored")
    .map((item) => `${item.title} ${item.description ?? ""}`)
    .join("  ");
  return {
    absent: new Set(),
    assembly,
    carriers,
    geocodeRan,
    noteText,
    pieces,
    records,
    report,
    source: "replay",
  };
}

// ===========================================================================
// REPORT
// ===========================================================================

const ORDER = { FAIL: 0, NOT_CHECKABLE: 1, NOT_BUILT: 2, PASS: 3 };
const MARK = { PASS: "PASS", FAIL: "FAIL", NOT_BUILT: "NOT BUILT", NOT_CHECKABLE: "NOT CHECKABLE" };

function renderReport({ results, meta }) {
  const lines = [];
  const counts = { PASS: 0, FAIL: 0, NOT_BUILT: 0, NOT_CHECKABLE: 0 };
  for (const result of results) counts[result.state] += 1;

  const ledgerFindings = results.flatMap((result) =>
    result.findings.filter((finding) => finding.kind === "ledger").map((finding) => finding.text)
  );
  const staleFindings = results.flatMap((result) =>
    result.findings
      .filter((finding) => finding.kind === "stale-declaration")
      .map((finding) => finding.text)
  );

  lines.push(`# Assembly scorecard — baseline against pinned parse \`${meta.parseKey}\``);
  lines.push("");
  if (meta.parity) {
    lines.push("## Production/replay parity gate");
    lines.push("");
    lines.push(
      `Semantic fingerprint: **${meta.parity.equal ? "PASS" : "FAIL"}** — ` +
        `production \`${meta.parity.leftHash}\`, replay \`${meta.parity.rightHash}\`.`
    );
    lines.push(
      `Ground-truth score states: **${meta.parity.scoreStatesEqual ? "PASS" : "FAIL"}**.`
    );
    lines.push(
      "Historical field availability: review answer options were not present in the saved QA " +
        "projection, so both comparable fingerprints deliberately omit them. New QA bundles " +
        "serve them directly."
    );
    if (meta.parity.sections.length > 0) {
      lines.push("");
      for (const section of meta.parity.sections) {
        lines.push(
          `- ${section.section}: production \`${section.leftHash}\` (${section.leftCount}), ` +
            `replay \`${section.rightHash}\` (${section.rightCount})`
        );
      }
    }
    if (meta.parity.scoreStateDiffs.length > 0) {
      lines.push("");
      for (const difference of meta.parity.scoreStateDiffs) {
        lines.push(
          `- ${difference.id}: production ${difference.production}, replay ${difference.replay}`
        );
      }
    }
    lines.push("");
  }
  if (meta.persistedStyleParity) {
    lines.push("## Current replay/persisted-style projection gate");
    lines.push("");
    lines.push(
      `Semantic fingerprint: **${meta.persistedStyleParity.equal ? "PASS" : "FAIL"}**; ` +
        `ground-truth score states: **${meta.persistedStyleParity.scoreStatesEqual ? "PASS" : "FAIL"}**.`
    );
    lines.push(
      "This compares the route-equivalent replay records with the exact redacted QA-record " +
        "projection the route would serve now, including review answer options and item order fields."
    );
    lines.push("");
  }
  if (meta.writerTrace) {
    lines.push("## Executable assembly writer trace");
    lines.push("");
    lines.push(
      `Assembly input hash: \`${meta.writerTrace.inputHash}\`; assembly code version: ` +
        `\`${meta.writerTrace.codeVersion}\`; final semantic output hash: ` +
        `\`${meta.writerTrace.outputHash}\`.`
    );
    lines.push(
      `${meta.writerTrace.entryCount} executed writer stage(s); ` +
        `${meta.writerTrace.changedCount} changed semantic state. Input mode: ` +
        `\`${meta.writerTrace.inputMode}\`.`
    );
    lines.push(
      `Trace integrity gate: **${meta.writerTrace.valid ? "PASS" : "FAIL"}**.`
    );
    lines.push("");
    lines.push("| # | Decision domain | Writer | Changed | Pieces changed | Writes |");
    lines.push("|---:|---|---|:---:|---:|---|");
    for (const entry of meta.writerTrace.entries) {
      lines.push(
        `| ${entry.ordinal} | ${entry.decisionDomain} | \`${entry.writer}\` | ` +
          `${entry.changed ? "yes" : "no"} | ${entry.changedPieceCount ?? "n/a"} | ` +
          `${entry.writes.map((field) => `\`${field}\``).join(", ")} |`
      );
    }
    lines.push("");
  }
  lines.push(
    `Trip \`${meta.tripId}\` — ${meta.tripName}. Generated ${meta.generatedAt} by ` +
      `\`scripts/scorecard.mjs\` in **${meta.source}** mode. Scope: ${SCOPE.join(", ")}.`
  );
  lines.push("");
  lines.push(
    meta.source === "payload"
      ? "Input: the live run's own audit payload — what actually shipped, geocode lane included. " +
          "`records.legs` and review-question identity fields are not carried by this surface and " +
          "are reported NOT CHECKABLE rather than assumed."
      : meta.source === "persisted-qa"
        ? "Input: the run's exact persisted QA-record projection. No row is reconstructed from " +
          "lineage. Fields omitted by the historical projection are reported unavailable rather " +
          "than inferred."
        : "Input: a route-equivalent re-assembly of the pinned parse with the matching saved " +
          "geocode provider outputs reattached at the original boundary. Candidate-pool or " +
          "result-id drift aborts the run."
  );
  lines.push("");
  lines.push(
    "**This report fixes nothing.** It is the baseline the fix queue is chosen from, so that " +
      "the next round works the ranked list rather than whichever symptom is loudest."
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| State | Count | Meaning |");
  lines.push("|---|---:|---|");
  lines.push(`| FAIL | ${counts.FAIL} | Built, and wrong. A defect or a drift. Investigate. |`);
  lines.push(
    `| NOT CHECKABLE | ${counts.NOT_CHECKABLE} | The data reaches no surface. An observability defect in its own right. |`
  );
  lines.push(
    `| NOT BUILT | ${counts.NOT_BUILT} | Contract text with no implementation. Expected work, not a defect. |`
  );
  lines.push(`| PASS | ${counts.PASS} | The contract held. |`);
  lines.push("");
  lines.push(
    `Geocode verification lane: **${meta.geocodeRan ? "pinned and replayed" : "DISABLED"}**` +
      (meta.geocodeRan
        ? "."
        : " — group-membership assertions are not permitted to report PASS or FAIL.")
  );
  lines.push("");

  if (ledgerFindings.length > 0) {
    lines.push("## Ledger defects — the ledger overstating its own coverage");
    lines.push("");
    lines.push(
      "These are not code defects and do not share a fix with them. Each is an entry whose " +
        "`Enforcement:` field claims coverage the scorecard cannot find any implementation for."
    );
    lines.push("");
    for (const finding of ledgerFindings) lines.push(`- ${finding}`);
    lines.push("");
  }
  if (staleFindings.length > 0) {
    lines.push("## Stale NOT BUILT declarations");
    lines.push("");
    for (const finding of staleFindings) lines.push(`- ${finding}`);
    lines.push("");
  }
  if (citationFindings.length > 0) {
    lines.push("## Ground-truth citation drift");
    lines.push("");
    for (const finding of citationFindings) lines.push(`- ${finding}`);
    lines.push("");
  }

  for (const entry of SCOPE) {
    const entryResults = results
      .filter((result) => result.entry === entry)
      .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.id.localeCompare(b.id));
    if (entryResults.length === 0) continue;
    const tally = entryResults.reduce((accumulator, result) => {
      accumulator[result.state] = (accumulator[result.state] ?? 0) + 1;
      return accumulator;
    }, {});
    lines.push(
      `## ${entry} — ledger \`${ledgerEnforcement.get(entry) ?? "(missing)"}\` — ` +
        Object.entries(tally)
          .map(([state, count]) => `${count} ${MARK[state]}`)
          .join(", ")
    );
    lines.push("");
    for (const result of entryResults) {
      lines.push(`### ${MARK[result.state]} — \`${result.id}\` ${result.claim}`);
      lines.push("");
      lines.push(`- Clause: ${result.clause}`);
      lines.push(`- Field read: \`${result.field}\``);
      lines.push(`- Reading: ${result.detail}`);
      if (result.gt) {
        lines.push(
          `- Answer key: \`${GROUND_TRUTH_DOC}:${result.gt.line}\` — expected phrase ` +
            `"${result.gt.expected}" (inspect the source locally)`
        );
      }
      lines.push("");
    }
  }

  lines.push("## How to read this");
  lines.push("");
  lines.push(
    "- **FAIL** means code exists and produces output that violates the contract. This is the fix queue."
  );
  lines.push(
    "- **NOT BUILT** means no implementation exists. Every declaration here carries a static probe; " +
      "if the probe had found an implementation the assertion would have been evaluated instead and " +
      "the stale declaration reported. NOT BUILT is never filtered out of this report."
  );
  lines.push(
    "- **NOT CHECKABLE** means the mechanism may have run but its output reaches no surface this " +
      "harness can read. Treat each one as its own defect: it is how three bar items went unscored for weeks."
  );
  lines.push(
    "- A `PARTIAL` entry with NOT BUILT assertions is not automatically wrong — `PARTIAL` admits an " +
      "uncovered path — but the ledger must NAME that path in the entry rather than let the label carry it. " +
      "The finding is raised either way; the judgement is the CEO's."
  );
  lines.push("");
  return { text: lines.join("\n"), counts };
}

// ===========================================================================
// MAIN
// ===========================================================================

function printConsole(results, counts) {
  const sorted = [...results].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.id.localeCompare(b.id)
  );
  console.log("\n=== ASSEMBLY SCORECARD ===\n");
  for (const result of sorted) {
    console.log(
      `${MARK[result.state].padEnd(13)} ${result.id.padEnd(12)} ${result.entry}  ${result.claim}`
    );
    console.log(`${" ".repeat(14)}field: ${result.field}`);
    console.log(`${" ".repeat(14)}read:  ${result.detail}`);
  }
  console.log(
    `\nFAIL ${counts.FAIL} · NOT CHECKABLE ${counts.NOT_CHECKABLE} · NOT BUILT ${counts.NOT_BUILT} · PASS ${counts.PASS}`
  );
}

if (DRY_RUN) {
  // Loads every module, resolves every citation, runs every probe, and proves
  // the assertion table is well-formed — without touching the database. This
  // is the check that a transcription error in an assertion cannot hide.
  const ids = ASSERTIONS.map((assertion) => assertion.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const problems = [];
  if (duplicates.length > 0) problems.push(`duplicate ids: ${duplicates.join(", ")}`);
  for (const assertion of ASSERTIONS) {
    if (!SCOPE.includes(assertion.entry)) {
      problems.push(`${assertion.id} is labelled ${assertion.entry}, outside scope`);
    }
    if (typeof assertion.run !== "function") problems.push(`${assertion.id} has no run()`);
    if (assertion.tier === 2 && !assertion.gt) {
      problems.push(`${assertion.id} is tier 2 and cites no ground-truth line`);
    }
    if (assertion.gt) assertion.gt();
    if (assertion.notBuilt) {
      const hits = probeSource(assertion.notBuilt.probe);
      console.log(
        `probe ${assertion.id}: ${assertion.notBuilt.probe} -> ${
          hits.length === 0 ? "NOT BUILT (no implementation)" : `STALE, found ${list(hits, 3)}`
        }`
      );
    }
  }
  console.log(
    `\n${ASSERTIONS.length} assertions — ` +
      SCOPE.map(
        (entry) => `${entry} ${ASSERTIONS.filter((a) => a.entry === entry).length}`
      ).join(", ")
  );
  console.log(
    `tier 1: ${ASSERTIONS.filter((a) => a.tier === 1).length} · tier 2: ${
      ASSERTIONS.filter((a) => a.tier === 2).length
    }`
  );
  for (const finding of citationFindings) console.log(`CITATION DRIFT: ${finding}`);
  for (const problem of problems) console.log(`TABLE PROBLEM: ${problem}`);
  console.log(
    problems.length === 0 && citationFindings.length === 0
      ? "\ndry run clean — the table is well-formed and every citation resolves"
      : "\ndry run found problems above"
  );
  process.exit(problems.length === 0 && citationFindings.length === 0 ? 0 : 1);
}

function emit(ctx, meta) {
  const results = ASSERTIONS.map((assertion) => evaluate(assertion, ctx));
  const { text, counts } = renderReport({ results, meta });
  printConsole(results, counts);
  const reportPath =
    outPath ??
    path.join(
      rootDir,
      "docs",
      `assembly-scorecard-${new Date().toISOString().slice(0, 10)}-run-8.1.0-${meta.source}.md`
    );
  fs.writeFileSync(reportPath, `${text.trimEnd()}\n`, "utf8");
  console.log(`\nreport written: ${path.relative(rootDir, reportPath)}`);
  process.exitCode =
    (meta.parity && (!meta.parity.equal || !meta.parity.scoreStatesEqual)) ||
    (meta.persistedStyleParity &&
      (!meta.persistedStyleParity.equal ||
        !meta.persistedStyleParity.scoreStatesEqual)) ||
    (meta.writerTrace && !meta.writerTrace.valid) ||
    (STRICT && counts.FAIL > 0)
      ? 1
      : 0;
}

function createProductionReplayParity({
  productionContext,
  replayContext,
  reviewAnswerOptionsAvailable = false,
}) {
  const fingerprintModule = require2(
    path.join(rootDir, "lib/extraction/assembly-semantic-fingerprint.ts")
  );
  const productionFingerprint = fingerprintModule.createAssemblySemanticFingerprint({
    legacyFingerprints: productionContext.report.fingerprints ?? {},
    records: productionContext.records,
    reviewAnswerOptionsAvailable,
  });
  const replayFingerprint = fingerprintModule.createAssemblySemanticFingerprint({
    legacyFingerprints: replayContext.report.fingerprints ?? {},
    records: replayContext.records,
    reviewAnswerOptionsAvailable,
  });
  const semantic = fingerprintModule.diffAssemblySemanticFingerprints(
    productionFingerprint,
    replayFingerprint
  );
  const parityAssertions = ASSERTIONS.filter((assertion) => !assertion.parityExcluded);
  const productionStates = new Map(
    parityAssertions.map((assertion) => [
      assertion.id,
      evaluate(assertion, productionContext).state,
    ])
  );
  const replayStates = new Map(
    parityAssertions.map((assertion) => [
      assertion.id,
      evaluate(assertion, replayContext).state,
    ])
  );
  const scoreStateDiffs = parityAssertions.flatMap((assertion) => {
    const production = productionStates.get(assertion.id);
    const replay = replayStates.get(assertion.id);
    return production === replay
      ? []
      : [{ id: assertion.id, production, replay }];
  });
  return {
    ...semantic,
    scoreStateDiffs,
    scoreStatesEqual: scoreStateDiffs.length === 0,
  };
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function openAIUsageFrom(value) {
  const root = objectValue(value);
  return Object.keys(objectValue(root.openai)).length > 0
    ? objectValue(root.openai)
    : root;
}

function geocodeReplaySeedFromSavedRun({ observations, openaiUsage }) {
  const geocodeUsage = objectValue(openAIUsageFrom(openaiUsage).geocodeVerification);
  if (geocodeUsage.outcome !== "completed") {
    throw new Error(
      `matching processing run has no completed geocode lane (outcome ${String(
        geocodeUsage.outcome ?? "missing"
      )})`
    );
  }

  const attachmentsById = new Map();
  for (const row of observations) {
    const payload = objectValue(row.payload_json);
    const candidateId =
      typeof payload._resolverCandidateId === "string"
        ? payload._resolverCandidateId
        : null;
    const lat = payload.verifiedLatitude;
    const lng = payload.verifiedLongitude;
    if (
      !candidateId ||
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      typeof lng !== "number" ||
      !Number.isFinite(lng)
    ) {
      continue;
    }
    const provenance = objectValue(payload._geoVerification);
    attachmentsById.set(candidateId, {
      candidateId,
      formattedAddress:
        typeof payload.verifiedFormattedAddress === "string"
          ? payload.verifiedFormattedAddress
          : null,
      lat,
      lng,
      provider:
        typeof provenance.provider === "string"
          ? provenance.provider
          : "geocode",
      query: typeof provenance.query === "string" ? provenance.query : "",
    });
  }

  const attachments = [...attachmentsById.values()];
  if (attachments.length !== Number(geocodeUsage.resolvedCount)) {
    throw new Error(
      `saved geocode result count mismatch: ${attachments.length} persisted attachments vs ` +
        `${Number(geocodeUsage.resolvedCount) || 0} resolved in usage`
    );
  }

  return {
    attachments,
    usage: geocodeUsage,
    version: 1,
  };
}

async function loadSavedGeocodeReplay({ admin, parseKey, tripId }) {
  const { data: runs, error: runError } = await admin
    .from("trip_processing_runs")
    .select("id,created_at,openai_usage")
    .eq("trip_id", tripId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (runError) {
    throw new Error(`cannot load saved processing runs: ${runError.message}`);
  }
  const run = (runs ?? []).find((candidate) => {
    const pinning = objectValue(
      openAIUsageFrom(candidate.openai_usage).extractionPinning
    );
    return pinning.parseKey === parseKey;
  });
  if (!run) {
    throw new Error(
      `no completed processing run carries extraction pin ${parseKey.slice(0, 12)}…`
    );
  }

  const { data: observations, error: observationError } = await admin
    .from("trip_evidence_observations")
    .select("payload_json")
    .eq("processing_run_id", run.id)
    .eq("trip_id", tripId);
  if (observationError) {
    throw new Error(
      `cannot load saved geocode observations: ${observationError.message}`
    );
  }

  return geocodeReplaySeedFromSavedRun({
    observations: observations ?? [],
    openaiUsage: run.openai_usage,
  });
}

// --- shared replay core ------------------------------------------------
// The live-DB replay and `--from-cache` differ only in WHERE `calls_json` and
// `materials` come from (a Supabase row+rebuild vs files `--export` wrote).
// From here on they must run the exact same code, or a `--from-cache` PASS
// would prove nothing about the assembly as it stands (Task 0's stated
// purpose). Factored into one function so that is true by construction
// instead of by two call sites being kept in sync by hand.
async function runExtractionAndAssembly({
  callsJson,
  geocodeReplaySeed,
  materials,
  tripId,
  tripName,
}) {
  const pinning = require2(path.join(rootDir, "lib/extraction/extraction-pinning.ts"));
  const geocode = require2(
    path.join(rootDir, "lib/extraction/geocode-verification.ts")
  );
  const parser = require2(path.join(rootDir, "lib/extraction/openai-trip-parser.ts"));
  const cache = pinning.createExtractionParseCache(callsJson);
  const geocodeReplay = geocodeReplaySeed
    ? geocode.createGeocodeVerificationReplayCache(geocodeReplaySeed)
    : null;
  const result = await pinning.runWithExtractionParseCache(cache, () =>
    geocodeReplay
      ? geocode.runWithGeocodeVerificationReplay(geocodeReplay, () =>
          parser.extractTripDraftWithOpenAI({ materials, tripName })
        )
      : parser.extractTripDraftWithOpenAI({ materials, tripName })
  );
  if (cache.misses > 0) {
    for (const missed of cache.missedCalls ?? []) {
      console.error(`  MISSED PIN: schema=${missed.schemaName} hash=${missed.hash.slice(0, 12)}…`);
    }
    console.error(
      `SCORECARD ABORT: ${cache.misses} model call(s) missed the pin — this is not a faithful ` +
        `reproduction and its scores must not be trusted.`
    );
    process.exit(1);
  }
  if (
    geocodeReplay &&
    (geocodeReplay.unmatchedCandidateIds.length > 0 ||
      geocodeReplay.actualCandidateCount !== geocodeReplay.expectedCandidateCount)
  ) {
    console.error(
      `SCORECARD ABORT: geocode pin does not match the replay candidate pool ` +
        `(pool ${geocodeReplay.actualCandidateCount}/${geocodeReplay.expectedCandidateCount}, ` +
        `unmatched results ${geocodeReplay.unmatchedCandidateIds.length}).`
    );
    for (const id of geocodeReplay.unmatchedCandidateIds.slice(0, 10)) {
      console.error(`  UNMATCHED GEOCODE PIN: ${id}`);
    }
    process.exit(1);
  }

  const assemblyModule = require2(
    path.join(rootDir, "lib/extraction/canonical-trip-assembly.ts")
  );
  const corridorModule = require2(
    path.join(
      rootDir,
      "lib/extraction/canonical-assembly-quality-corridor.ts"
    )
  );
  const preparedEvidence = assemblyModule.prepareCanonicalEvidencePieces(
    result.evidenceArtifacts.pieces
  );
  const corridor = corridorModule.runCanonicalAssemblyQualityCorridor({
    baseUsage: result.usage,
    draft: result.draft,
    fallbackTripName: tripName,
    preparedEvidence,
    sourceEvidenceArtifacts: result.evidenceArtifacts,
    tripId,
  });
  return {
    assembly: corridor.assembly,
    assessment: corridor.assessment,
    corridor,
    evidenceArtifacts: result.evidenceArtifacts,
    preparedEvidence,
  };
}

// Recomputing the parse key is the guard, not a helper for computing one —
// it is what turns a stale `--export` (uploads changed since) into a loud
// abort instead of a quietly wrong score. Shared so `--from-cache` runs
// EXACTLY the same check the live replay does, not a weaker lookalike.
function requireMatchingParseKey({ materials, model, samplingParams, storedParseKey, sourceLabel }) {
  const pinning = require2(path.join(rootDir, "lib/extraction/extraction-pinning.ts"));
  const normalizedSamplingParams =
    samplingParams && typeof samplingParams === "object" ? samplingParams : {};
  const parseKey = pinning.computeExtractionParseKey({
    materialFingerprints: pinning.fingerprintExtractionMaterials(materials),
    model,
    samplingParams: normalizedSamplingParams,
  });
  if (parseKey !== storedParseKey) {
    console.error(
      `SCORECARD ABORT: parse key mismatch (rebuilt ${parseKey.slice(0, 12)}… vs ${sourceLabel} ` +
        `${storedParseKey.slice(0, 12)}…). Sampling params came from the pin, so this is a ` +
        `MATERIALS difference. Scoring a different input would be worse than not scoring.`
    );
    process.exit(1);
  }
  return parseKey;
}

// --- payload mode: score what the LIVE run shipped --------------------------
if (payloadPath) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(payloadPath), "utf8"));
  const ctx = contextFromPayload(payload);
  emit(ctx, {
    generatedAt: new Date().toISOString().slice(0, 10),
    geocodeRan: ctx.geocodeRan,
    parseKey: payload.reportRun?.id ?? "(live run)",
    source: "payload",
    tripId: payload.trip?.id ?? "(unknown)",
    tripName: payload.trip?.name ?? "(unnamed)",
  });
  process.exit(process.exitCode ?? 0);
}

// --- persisted QA mode: score exact records, never lineage reconstruction --
if (qaBundlePath && !fromCacheDir) {
  const bundle = JSON.parse(
    fs.readFileSync(path.resolve(qaBundlePath), "utf8")
  );
  const auditPayload = qaAuditPayloadPath
    ? JSON.parse(fs.readFileSync(path.resolve(qaAuditPayloadPath), "utf8"))
    : null;
  const ctx = contextFromQaBundle(bundle, auditPayload);
  emit(ctx, {
    generatedAt: new Date().toISOString().slice(0, 10),
    geocodeRan: ctx.geocodeRan,
    parseKey:
      bundle.audit?.processingEvents?.find(
        (event) => event?.stage === "quality_assessment"
      )?.processingRunId ?? "(persisted QA)",
    source: "persisted-qa",
    tripId: bundle.records?.trip?.id ?? bundle.trip?.id ?? "(unknown)",
    tripName: bundle.records?.trip?.name ?? bundle.trip?.name ?? "(unnamed)",
  });
  process.exit(process.exitCode ?? 0);
}

// --- from-cache mode: the replay, from `--export`'s files, no network ------
// Task 0. This must not require `lib/supabase/admin.ts` / `server.ts` (the
// live replay block below does, at module load) or `lib/uploads.ts` — those
// are the DB-touching modules a human's terminal is needed for. Everything
// this branch reads comes from `<dir>`, and the require()s below never reach
// past `lib/extraction/*`, which is code, not data access.
if (fromCacheDir) {
  const dir = path.resolve(fromCacheDir);
  const readCacheFile = (name) => {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      console.error(`cache dir ${dir} has no ${name} — run --export first`);
      process.exit(2);
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const cachedParse = readCacheFile("parse.json");
  const cachedCalls = readCacheFile("calls.json");
  const cachedGeocode = readCacheFile("geocode.json");
  const materials = readCacheFile("materials.json");
  const cachedTrip = readCacheFile("trip.json");
  if (!Array.isArray(materials) || materials.length === 0) {
    console.error("SCORECARD ABORT: cached materials array is empty — the cache is unusable.");
    process.exit(1);
  }

  requireMatchingParseKey({
    materials,
    model: cachedParse.extraction_model,
    samplingParams: cachedParse.sampling_params,
    storedParseKey: cachedParse.parse_key,
    sourceLabel: "cached",
  });

  const {
    assembly,
    assessment,
    evidenceArtifacts,
    preparedEvidence,
  } = await runExtractionAndAssembly({
    callsJson: cachedCalls,
    geocodeReplaySeed: cachedGeocode,
    materials,
    tripId: cachedTrip.id,
    tripName: cachedTrip.name,
  });

  const replayContext = buildContext({
    records: assembly.records,
    report: assessment.report,
    pieces: preparedEvidence.pieces,
    assembly,
  });
  let parity = null;
  if (qaBundlePath) {
    const bundle = JSON.parse(
      fs.readFileSync(path.resolve(qaBundlePath), "utf8")
    );
    const auditPayload = qaAuditPayloadPath
      ? JSON.parse(fs.readFileSync(path.resolve(qaAuditPayloadPath), "utf8"))
      : null;
    parity = createProductionReplayParity({
      productionContext: contextFromQaBundle(bundle, auditPayload),
      replayContext,
    });
    console.log(
      `\nSEMANTIC PARITY ${parity.equal ? "PASS" : "FAIL"}: ` +
        `production ${parity.leftHash}, replay ${parity.rightHash}`
    );
    console.log(
      `SCORE-STATE PARITY ${parity.scoreStatesEqual ? "PASS" : "FAIL"}: ` +
        `${parity.scoreStateDiffs.length} differing assertion(s)`
    );
  }
  const traceEntries = assessment.report.canonicalization.stageWriterTrace ?? [];
  if (process.env.SCORECARD_CANDIDACY_TRACE === "1") {
    console.log(
      "CANDIDACY TRACE " +
        JSON.stringify(
          assessment.report.canonicalization.activityCandidacyDecisions ?? []
        )
    );
  }
  if (process.env.SCORECARD_CONTAINMENT_TRACE === "1") {
    console.log(
      "CONTAINMENT TRACE " +
        JSON.stringify(
          assessment.report.canonicalization.containmentLedger ?? null
        )
    );
  }
  const identityTraceTitle = process.env.SCORECARD_IDENTITY_TRACE_TITLE
    ?.trim()
    .toLowerCase();
  if (identityTraceTitle) {
    const titleMatches = (value) =>
      String(value ?? "").toLowerCase().includes(identityTraceTitle);
    const matchingCandidacy =
      assessment.report.canonicalization.activityCandidacyDecisions
        ?.filter((decision) => titleMatches(decision.title)) ?? [];
    const matchingPieceIds = new Set(
      matchingCandidacy.flatMap((decision) =>
        decision.canonicalPieceIds ?? []
      )
    );
    console.log(
      "IDENTITY TRACE " +
        JSON.stringify({
          blocks:
            assessment.report.canonicalization.intentBlocks?.blocks
              ?.filter((block) =>
                block.memberIds?.some((id) => matchingPieceIds.has(id))
              ) ?? [],
          candidacy: matchingCandidacy,
          decisions:
            assessment.report.canonicalization.identityLedger?.decisions
              ?.filter((decision) =>
                decision.observationIds?.some((id) =>
                  evidenceArtifacts.observations?.some(
                    (observation) =>
                      observation.id === id &&
                      titleMatches(observation.payload?.title)
                  )
                )
              ) ?? [],
          ledger: {
            unresolvedCarrierCount:
              assessment.report.canonicalization.identityLedger
                ?.unresolvedCarrierCount ?? null,
            version:
              assessment.report.canonicalization.identityLedger?.version ??
              null,
          },
          observations:
            evidenceArtifacts.observations
              ?.filter((observation) =>
                titleMatches(observation.payload?.title)
              )
              .map((observation) => ({
                date: observation.payload?.date ?? null,
                id: observation.id,
                ordinal: observation.ordinal,
                role: observation.role,
                sourceLabel: observation.sourceLabel,
                sourcePosition:
                  observation.payload?._canonicalSourcePosition ?? null,
                sourceOccurrences:
                  observation.payload?._canonicalSourceOccurrences ?? [],
                sourceStructure: observation.sourceStructure,
                title: observation.payload?.title ?? null,
              })) ?? [],
          pieces:
            evidenceArtifacts.pieces
              ?.filter(
                (piece) =>
                  titleMatches(piece.payload?.title) ||
                  titleMatches(piece.payload?.description)
              )
              .map((piece) => ({
                candidacy:
                  piece.payload?._canonicalCandidacyDecision ?? null,
                city: piece.payload?.city ?? null,
                date: piece.payload?.date ?? null,
                disposition: piece.disposition ?? null,
                id: piece.id,
                intentBlockType:
                  piece.payload?._intentBlockType ?? null,
                kind: piece.kind,
                noteCollectionTitle:
                  piece.payload?._canonicalNoteCollectionTitle ?? null,
                observationIds: piece.observationIds,
                outputEligible: piece.outputEligible,
                title: piece.payload?.title ?? null,
              })) ?? [],
          lineage:
            assessment.report.lineage
              ?.filter((entry) => titleMatches(entry.title))
              .map((entry) => ({
                actions: entry.actions,
                canonicalPieceId: entry.canonicalPieceId,
                date: entry.date,
                disposition: entry.disposition,
                finalRecords: entry.finalRecords,
                kind: entry.kind,
                outputEligible: entry.outputEligible,
                role: entry.role,
                title: entry.title,
              })) ?? [],
        })
    );
  }
  const evidenceModule = require2(
    path.join(rootDir, "lib/extraction/evidence-clustering.ts")
  );
  const semanticModule = require2(
    path.join(rootDir, "lib/extraction/assembly-semantic-fingerprint.ts")
  );
  const replaySemanticFingerprint =
    semanticModule.createAssemblySemanticFingerprint({
      legacyFingerprints: assessment.report.fingerprints ?? {},
      records: assembly.records,
    });
  const classifierTrace = traceEntries.find(
    (entry) => entry.writer === "applyIntentBlockClassification"
  );
  const reconciliationTrace = traceEntries.filter((entry) =>
    entry.writer.startsWith("reconcileCardsAgainstCityNotes")
  );
  const enforcementTrace = traceEntries.find(
    (entry) => entry.writer === "enforceCanonicalOutputActivityRoles"
  );
  const writerTrace = {
    changedCount: traceEntries.filter((entry) => entry.changed).length,
    codeVersion: evidenceModule.EVIDENCE_CLUSTER_VERSION,
    entries: traceEntries,
    entryCount: traceEntries.length,
    inputHash: cachedParse.parse_key,
    inputMode: "pinned_parse_plus_saved_geocode",
    outputHash: replaySemanticFingerprint.hash,
    valid:
      traceEntries.length > 0 &&
      traceEntries.every(
        (entry, index) =>
          entry.ordinal === index + 1 && entry.beforeHash && entry.afterHash
      ) &&
      Boolean(classifierTrace) &&
      reconciliationTrace.length === 1 &&
      reconciliationTrace[0].ordinal > classifierTrace.ordinal &&
      Boolean(enforcementTrace) &&
      enforcementTrace.ordinal > reconciliationTrace[0].ordinal &&
      enforcementTrace.writes.length === 0,
  };
  console.log(
    `WRITER TRACE: ${writerTrace.entryCount} stages, ${writerTrace.changedCount} changed state`
  );
  const qaProjectionModule = require2(
    path.join(rootDir, "lib/extraction/trip-extraction-qa-bundle.ts")
  );
  const projectedRecords = qaProjectionModule.createRecordSummaries({
    includePrivate: false,
    records: assembly.records,
  });
  const persistedStyleContext = contextFromQaBundle(
    { audit: {}, records: projectedRecords },
    { report: assessment.report },
    { historicalProjection: false }
  );
  const persistedStyleParity = createProductionReplayParity({
    productionContext: persistedStyleContext,
    replayContext,
    reviewAnswerOptionsAvailable: true,
  });
  console.log(
    `PERSISTED-STYLE PARITY ${
      persistedStyleParity.equal && persistedStyleParity.scoreStatesEqual
        ? "PASS"
        : "FAIL"
    }: ${persistedStyleParity.scoreStateDiffs.length} score-state difference(s)`
  );
  if (process.env.SCORECARD_PARITY_TRACE === "1") {
    console.log(
      "PERSISTED-STYLE PARITY TRACE " +
        JSON.stringify(
          persistedStyleParity.scoreStateDiffs.map((difference) => {
            const assertion = ASSERTIONS.find(
              (candidate) => candidate.id === difference.id
            );
            return {
              ...difference,
              productionDetail: assertion
                ? evaluate(assertion, persistedStyleContext).detail
                : null,
              replayDetail: assertion
                ? evaluate(assertion, replayContext).detail
                : null,
            };
          })
        )
    );
  }

  // Exit 0 by default, same as the live replay: this is a baseline, and a
  // permanently red gate teaches people to ignore it.
  emit(
    replayContext,
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      geocodeRan: true,
      parseKey: cachedParse.parse_key.slice(0, 12),
      parity,
      persistedStyleParity,
      writerTrace,
      // A distinct `source` (not "replay") is how the report records, in its
      // own meta, that this run came from a cache — no change to
      // `renderReport`'s logic needed: `meta.source` already flows straight
      // into the header line and the default report filename.
      source: "from-cache",
      tripId: cachedTrip.id,
      tripName: cachedTrip.name ?? "(unnamed)",
    }
  );
  process.exit(process.exitCode ?? 0);
}

// --- replay ----------------------------------------------------------------
const adminModule = require2(path.join(rootDir, "lib/supabase/admin.ts"));
const serverModule = require2(path.join(rootDir, "lib/supabase/server.ts"));
serverModule.createSupabaseServerClient = async () =>
  adminModule.createSupabaseAdminClient();
const admin = adminModule.createSupabaseAdminClient();

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let parseQuery = admin
  .from("trip_extraction_parses")
  .select("trip_id,parse_key,extraction_model,sampling_params,calls_json")
  .like("parse_key", `${parseKeyPrefix}%`);
if (requestedTrip && FULL_UUID.test(requestedTrip)) {
  parseQuery = parseQuery.eq("trip_id", requestedTrip);
}
const { data: parseRows, error: parseError } = await parseQuery;
if (parseError || !parseRows?.length) {
  console.error(
    `cannot load pinned parse ${parseKeyPrefix}…: ${parseError?.message ?? "no row"}`
  );
  process.exit(2);
}
if (parseRows.length > 1) {
  console.error(
    `parse key prefix ${parseKeyPrefix}… is ambiguous (${parseRows.length} rows)`
  );
  process.exit(2);
}
const parseRow = parseRows[0];
const tripId = parseRow.trip_id;
const { data: tripRow, error: tripError } = await admin
  .from("trips")
  .select("id,name")
  .eq("id", tripId)
  .maybeSingle();
if (tripError || !tripRow) {
  console.error(`cannot load trip ${tripId}: ${tripError?.message}`);
  process.exit(2);
}

const uploadsModule = require2(path.join(rootDir, "lib/uploads.ts"));
const materialsModule = require2(path.join(rootDir, "lib/extraction/trip-materials.ts"));
const uploads = await uploadsModule.listTripUploads(tripId);
const prepared = await materialsModule.getTripExtractionMaterialsWithSummary(uploads, {
  retryFailedOcr: false,
});
const materials = prepared.materials;
if (materials.length === 0) {
  console.error("SCORECARD ABORT: zero materials rebuilt — the pin cannot be replayed.");
  process.exit(1);
}

let savedGeocodeReplay;
try {
  savedGeocodeReplay = await loadSavedGeocodeReplay({
    admin,
    parseKey: parseRow.parse_key,
    tripId,
  });
} catch (error) {
  console.error(
    `SCORECARD ABORT: unable to pin the saved geocode lane: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(2);
}

// Task 0: `--export` writes everything `--from-cache` needs to redo this
// replay offline. Written before the parse-key check below because
// `--from-cache` runs that exact check itself against these same files — the
// cache does not need to be pre-verified to be useful; it needs to be honest
// about what it captured.
if (exportDir) {
  const dir = path.resolve(exportDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "parse.json"),
    JSON.stringify(
      {
        trip_id: parseRow.trip_id,
        parse_key: parseRow.parse_key,
        extraction_model: parseRow.extraction_model,
        sampling_params: parseRow.sampling_params,
      },
      null,
      2
    ),
    "utf8"
  );
  // `calls_json` is the large one (every pinned model response) — its own
  // file so `parse.json` stays readable.
  fs.writeFileSync(path.join(dir, "calls.json"), JSON.stringify(parseRow.calls_json), "utf8");
  fs.writeFileSync(
    path.join(dir, "geocode.json"),
    JSON.stringify(savedGeocodeReplay, null, 2),
    "utf8"
  );
  // Full fidelity, no truncation of any material's text: the parse key is
  // derived from the materials themselves, so a cache that silently shortened
  // one would make `requireMatchingParseKey` in `--from-cache` reject it —
  // exactly the failure mode this file exists to avoid.
  fs.writeFileSync(path.join(dir, "materials.json"), JSON.stringify(materials), "utf8");
  fs.writeFileSync(
    path.join(dir, "trip.json"),
    JSON.stringify({ id: tripRow.id, name: tripRow.name }, null, 2),
    "utf8"
  );
  console.error(`--export wrote ${dir}/{parse,calls,geocode,materials,trip}.json`);
}

requireMatchingParseKey({
  materials,
  model: parseRow.extraction_model,
  samplingParams: parseRow.sampling_params,
  storedParseKey: parseRow.parse_key,
  sourceLabel: "stored",
});

const { assembly, assessment, preparedEvidence } = await runExtractionAndAssembly({
  callsJson: parseRow.calls_json,
  geocodeReplaySeed: savedGeocodeReplay,
  materials,
  tripId,
  tripName: tripRow.name,
});

// Exit 0 by default: this is a baseline, and a permanently red gate teaches
// people to ignore it. `--strict` makes FAIL non-zero for when it becomes one.
emit(
  buildContext({
    records: assembly.records,
    report: assessment.report,
    pieces: preparedEvidence.pieces,
    assembly,
  }),
  {
    generatedAt: new Date().toISOString().slice(0, 10),
    geocodeRan: true,
    parseKey: parseRow.parse_key.slice(0, 12),
    source: "replay",
    tripId,
    tripName: tripRow.name ?? "(unnamed)",
  }
);
