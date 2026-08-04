// Assembly scorecard — the approved answer key as executable assertions,
// each labelled with the contract entry it proves.
//
//   node scripts/scorecard.mjs [--dry-run] [--out <path>] [<tripIdOrPrefix>] <parseKeyPrefix>
//   node scripts/scorecard.mjs --payload <audit-payload.json> [--out <path>]
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
//   identity/placement/question assertions are exact — but the geocode lane is
//   not pinned and stays off. In production, once that lane has run ANYWHERE
//   in the trip, the grouping lane refuses unverified parser coordinates (a
//   locked policy) — so with the lane off, replay does not produce "less
//   grouping", it produces DIFFERENT grouping, built on coordinates production
//   would have thrown away. 2026-08-04 replay, same pin: the live run grouped
//   7 stops; replayed, it grouped 14, ten with no source backing at all
//   (Schönbrunn alone gained four members it does not have in production). So
//   no assertion about WHICH records ended up in WHICH group is checkable in
//   replay, not just the ones that read a verified coordinate directly — see
//   `judgeableIn` below.
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
// LIMITS OF THIS METHOD, cited per AGENTS.md rule 7(a). This harness replays a
// pinned parse using the same bootstrap as `scripts/replay-pinned-parse.mjs`,
// whose header (line 14) records that the geocode verification lane is NOT
// pinned and stays disabled. The 2026-07-31 docket §6.3 states the consequence
// directly: root cause A (the collapse eating a site container) IS replayable
// against pin `a3e0ab66…`; root cause B (the retry→address→hierarchy loop) is
// NOT, and "a replay that shows a clean Schönbrunn group proves nothing about
// it". That understated the blast radius: it is not only the verified-
// coordinate reads that go dark. Once the geocode lane has run anywhere in the
// trip, production's grouping lane refuses unverified parser coordinates
// outright (a locked policy); replay, with the lane off, groups on those same
// unverified coordinates instead. The 2026-08-04 replay proved this is not a
// smaller version of the same grouping: live run 8.1.0 grouped 7 stops, the
// identical parse replayed grouped 14, ten of them with no source backing at
// all. So every assertion about GROUP MEMBERSHIP — not just the ones that read
// `verifiedLatitude`/`verifiedLongitude` directly — is out of reach in replay.
// Those assertions declare `judgeableIn: ["payload"]` and report NOT_CHECKABLE
// here rather than PASS or FAIL. A clean (or dirty) grouping result from this
// script, for those assertions, is silence, not evidence — only `--payload`
// can judge them.
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
if (payloadPath && (fromCacheDir || exportDir)) {
  console.error("--payload scores a saved audit; --from-cache/--export are replay-only.");
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
const SCOPE = ["RW-ORD-001", "RW-CLS-001", "RW-GRP-001", "RW-PLC-001"];

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
      `${GROUND_TRUTH_DOC}:${lineNumber} no longer contains "${expectedSubstring}" — ` +
        `found "${text.trim().slice(0, 90)}". The assertion citing it is unverified.`
    );
  }
  return { line: lineNumber, text: text.trim(), expected: expectedSubstring };
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
    needs: ["reviewQuestionFields"],
    notBuilt: {
      reason:
        "Recorded 2026-08-02. `mergeCanonicalPieceInto` still calls `refreshCanonicalPieceId` on every merge, so piece ids remain the only handle.",
      probe: /decisionAnchor|stableAnchor|anchorKey\b/,
    },
    run: (ctx) => {
      const anchored = ctx.records.reviewQuestions.filter(
        (question) => question.targetField && question.subjectCanonicalId
      );
      return {
        ok: anchored.length === ctx.records.reviewQuestions.length,
        field: "records.reviewQuestions[].subjectCanonicalId/.targetField",
        detail: `${anchored.length}/${ctx.records.reviewQuestions.length} decisions carry a subject + target field`,
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
    notBuilt: {
      reason:
        "Decided 2026-08-02. No block-boundary detection exists; classification is still per item and per day section.",
      probe: /blockType|blockIntent|intentBlock|blockBoundar/i,
    },
    run: () => ({
      ok: false,
      field: "(no block-type field is produced)",
      detail: "unreachable while the probe finds no implementation",
    }),
  },
  {
    id: "CLS-3",
    entry: "RW-CLS-001",
    tier: 1,
    clause:
      "City Notes are keyed to a city and anchored on its legs; a City Note has no day",
    claim: "No active City Note carries a date",
    notBuilt: {
      reason:
        "Decided 2026-08-02. Notes are still leg-owned via `findLegForCanonicalCity`, which returns the FIRST leg matching a city name — the exact shape the ledger names as easy to get wrong.",
      probe: /cityNoteKey|notesForCity|cityNoteCity|noteCityKey/,
    },
    run: (ctx) => {
      const dated = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" && item.itemType === "note" && item.date
      );
      return {
        ok: dated.length === 0,
        field: "records.items[].itemType + .date",
        detail:
          dated.length === 0
            ? "no dated notes"
            : `${dated.length} dated note(s): ${list(
                dated.map((item) => `"${item.title}" ${item.date}`)
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
    judgeableIn: ["payload"],
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
    claim: "No two distinct venues share a verified coordinate",
    // Membership assertion: reads `verifiedLatitude`/`.verifiedLongitude`
    // directly, which do not exist in replay (the geocode lane is not pinned
    // and stays disabled — replay-pinned-parse.mjs:14). Previously handled
    // with a one-off `if (!ctx.geocodeRan)` return here; folded into the
    // shared `judgeableIn` mechanism per the 2026-08-04 replay finding that
    // ALL grouping/membership reads, not just this one, need the same
    // treatment. Live run 8.1.0 scored this FAIL with 10 collisions, 2 of
    // them distinct venues on a container centroid (docket §2/§4b).
    judgeableIn: ["payload"],
    run: (ctx) => {
      const byCoordinate = new Map();
      for (const row of ctx.report.lineage) {
        for (const observation of row.observations) {
          if (observation.verifiedLatitude == null) continue;
          const key = `${observation.verifiedLatitude},${observation.verifiedLongitude}`;
          if (!byCoordinate.has(key)) byCoordinate.set(key, new Set());
          byCoordinate.get(key).add(norm(observation.title));
        }
      }
      const collisions = [...byCoordinate.entries()].filter(
        ([, titles]) => titles.size > 1
      );
      return {
        ok: collisions.length === 0,
        field: "report.lineage[].observations[].verifiedLatitude/.verifiedLongitude",
        detail:
          collisions.length === 0
            ? "no shared verified coordinates"
            : `${collisions.length} collision(s): ${list(
                collisions.map(([key, titles]) => `${key} <- ${titles.size} venues`)
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
    judgeableIn: ["payload"],
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
    judgeableIn: ["payload"],
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
    judgeableIn: ["payload"],
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
    claim: "The nine scattered Jan-19 Vienna venues are City Notes, not Activities",
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
      for (const token of ideas) {
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
            asCard.length > 0 ? `${asCard.length} shipped as Activities: ${list(asCard)}` : null,
            lost.length > 0
              ? `${lost.length} reached neither a card nor the note text: ${list(lost)}`
              : null,
            asCard.length === 0 && lost.length === 0 ? "all nine filed as notes" : null,
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
      "An explicit 'X or Y' slot is ONE Activity with the choice in the description — no question, no blocker",
    claim: "Mumok / Natural History is one card, alternatives in the description",
    gt: () => citation(178, "Mumok"),
    run: (ctx) => {
      const cards = ctx.records.items.filter(
        (item) =>
          item.status !== "ignored" &&
          item.itemType !== "note" &&
          (has(item.title, "mumok") || has(item.title, "natural history"))
      );
      const carriesAlternative = cards.some(
        (card) =>
          has(card.title, "or") ||
          has(card.description ?? "", "mumok") ||
          has(card.description ?? "", "natural history")
      );
      return {
        ok: cards.length === 1 && carriesAlternative,
        field: "records.items[].title + .description",
        detail:
          cards.length === 0
            ? "neither alternative survived as a card"
            : `${cards.length} card(s): ${list(cards.map((item) => `"${item.title}"`))}; alternative in description: ${carriesAlternative}`,
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
    judgeableIn: ["payload"],
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
  // `judgeableIn` mirrors `needs`/`absent` above, but the reason is not that a
  // surface is missing from this input — it is that the surface this input
  // DOES carry is measuring a configuration production never ships. In
  // production, once the geocode lane has run anywhere in the trip, the
  // grouping lane refuses unverified parser coordinates outright (a locked
  // policy); replay runs with the lane off, so it groups on those same
  // unverified coordinates instead — DIFFERENT membership, not less of it.
  // 2026-08-04 replay, same pin: live run 8.1.0 grouped 7 stops, replayed it
  // grouped 14, ten with no source backing at all (Schönbrunn alone gained
  // four members it does not have in production). So any assertion about
  // WHICH records ended up in WHICH group cannot report PASS or FAIL from
  // replay — a clean OR dirty replay grouping result is silence either way.
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
      field:
        "(group membership is not judgeable in the replay input — unverified-coordinate policy divergence)",
      detail:
        "replay's grouping lane runs without the geocode lane, so it admits members production's " +
        "locked policy would refuse once that lane has run anywhere in the trip. 2026-08-04 replay: " +
        "live run 8.1.0 grouped 7 stops, the same parse replayed grouped 14, 10 with no source " +
        "backing (Schönbrunn alone gained four members it does not have in production). Re-run with " +
        "--payload to score this.",
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
      date: record.date,
      description: record.description,
      endTime: record.endTime,
      id: record.id,
      itemType: record.type ?? "activity",
      legId: undefined,
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
      : "Input: a re-assembly of the pinned parse. Full records, but the geocode lane is not pinned " +
          "and stays off, so verified-coordinate assertions are reported NOT CHECKABLE."
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
    `Geocode verification lane: **${meta.geocodeRan ? "ran" : "DISABLED"}**` +
      (meta.geocodeRan
        ? "."
        : " — not pinned (`replay-pinned-parse.mjs:14`). Per the 2026-07-31 docket §6.3 " +
          "every verified-coordinate assertion below reports NOT CHECKABLE and is not permitted " +
          "to report PASS; a clean grouping result from this harness is silence, not evidence.")
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
          `- Answer key: \`${GROUND_TRUTH_DOC}:${result.gt.line}\` — ${result.gt.text.slice(0, 150)}`
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
  fs.writeFileSync(reportPath, `${text}\n`, "utf8");
  console.log(`\nreport written: ${path.relative(rootDir, reportPath)}`);
  process.exitCode = STRICT && counts.FAIL > 0 ? 1 : 0;
}

// --- shared replay core ------------------------------------------------
// The live-DB replay and `--from-cache` differ only in WHERE `calls_json` and
// `materials` come from (a Supabase row+rebuild vs files `--export` wrote).
// From here on they must run the exact same code, or a `--from-cache` PASS
// would prove nothing about the assembly as it stands (Task 0's stated
// purpose). Factored into one function so that is true by construction
// instead of by two call sites being kept in sync by hand.
async function runExtractionAndAssembly({ callsJson, materials, tripId, tripName }) {
  const pinning = require2(path.join(rootDir, "lib/extraction/extraction-pinning.ts"));
  const parser = require2(path.join(rootDir, "lib/extraction/openai-trip-parser.ts"));
  const cache = pinning.createExtractionParseCache(callsJson);
  const result = await pinning.runWithExtractionParseCache(cache, () =>
    parser.extractTripDraftWithOpenAI({ materials, tripName })
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
    fallbackTripName: tripName,
    priorRecoveryActions: preparedEvidence.recoveryActions,
    tripId,
  });
  const observations = assemblyModule.materializeCanonicalEvidenceObservations({
    draft: assembly.draft,
    observations: result.evidenceArtifacts.observations,
    pieces: preparedEvidence.pieces,
  });
  const assessment = qualityModule.assessTripDraftQuality({
    draft: assembly.draft,
    evidenceArtifacts: { observations, pieces: preparedEvidence.pieces },
    records: assembly.records,
    usage: {
      ...(result.usage && typeof result.usage === "object" ? result.usage : {}),
      finalization: assembly.finalization,
      identityRecovery: assembly.recovery,
    },
  });
  return { assembly, assessment, preparedEvidence };
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

  const { assembly, assessment, preparedEvidence } = await runExtractionAndAssembly({
    callsJson: cachedCalls,
    materials,
    tripId: cachedTrip.id,
    tripName: cachedTrip.name,
  });

  // Exit 0 by default, same as the live replay: this is a baseline, and a
  // permanently red gate teaches people to ignore it.
  emit(
    buildContext({
      records: assembly.records,
      report: assessment.report,
      pieces: preparedEvidence.pieces,
      assembly,
    }),
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      geocodeRan: false,
      parseKey: cachedParse.parse_key.slice(0, 12),
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
  console.error(`--export wrote ${dir}/{parse,calls,materials,trip}.json`);
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
    geocodeRan: false,
    parseKey: parseRow.parse_key.slice(0, 12),
    source: "replay",
    tripId,
    tripName: tripRow.name ?? "(unnamed)",
  }
);
