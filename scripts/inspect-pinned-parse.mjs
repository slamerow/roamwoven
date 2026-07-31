// Read-only inspector for a pinned extraction parse.
//
// Answers ONE question the replay harness cannot: did the MODEL emit a given
// set of items separately, or did it already collapse them into prose?
// The replay harness runs assembly with the geocode lane disabled
// (replay-pinned-parse.mjs:14), so it can never judge grouping — but the fold
// we care about happens at EXTRACTION, upstream of geocoding, and the model's
// raw output for the exact parse is sitting in trip_extraction_parses.calls_json.
//
// Read-only: one .select(), no writes, no model calls, no assembly.
//
//   node scripts/inspect-pinned-parse.mjs <parseKeyPrefix> [token ...]
//
// Bootstrap is copied verbatim from scripts/replay-pinned-parse.mjs so the
// documented pitfalls stay fixed: fileURLToPath (the repo path has spaces),
// .env.local loading, and the anon-key stand-in that satisfies
// hasSupabaseServerConfig()'s truthiness gate.

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const envPath = path.join(rootDir, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}
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
const adminModule = require2(path.join(rootDir, "lib/supabase/admin.ts"));
const admin = adminModule.createSupabaseAdminClient();

// --dump prints the FULL object the model emitted for each match, not just
// title/date. Added 2026-07-31 for run-2 Task 2: §4's two candidate causes
// need opposite fixes, and the field that separates them — whether the model
// itself tagged the piece as notes/context, or the pipeline demoted a normal
// dated day-section activity — lives in sourceSectionType / sourceSectionLabel
// / evidenceRole / itemType, none of which the title-and-date view shows.
const rawArgv = process.argv.slice(2);
const DUMP = rawArgv.includes("--dump");
const argv = rawArgv.filter((value) => value !== "--dump");
if (argv.length === 0) {
  console.error(
    "usage: node scripts/inspect-pinned-parse.mjs [--dump] <parseKeyPrefix> [token ...]"
  );
  process.exit(2);
}
const parseKeyPrefix = argv[0];
const TOKENS =
  argv.length > 1
    ? argv.slice(1)
    : [
        "Gloriette",
        "Orangerie",
        "Palm house",
        "Strudel",
        "Panorama",
        "Schönbrunn",
      ];

const { data: rows, error } = await admin
  .from("trip_extraction_parses")
  .select("trip_id,parse_key,extraction_model,calls_json")
  .like("parse_key", `${parseKeyPrefix}%`);
if (error || !rows?.length) {
  console.error(
    `cannot load pinned parse ${parseKeyPrefix}…: ${error?.message ?? "no row"}`
  );
  process.exit(2);
}
if (rows.length > 1) {
  console.error(
    `prefix ${parseKeyPrefix}… is ambiguous (${rows.length} rows): ` +
      rows.map((r) => r.parse_key.slice(0, 16)).join(", ")
  );
  process.exit(2);
}
const row = rows[0];
const calls = row.calls_json ?? [];
console.log(
  `parse ${row.parse_key.slice(0, 12)}… — trip ${row.trip_id} — ${calls.length} calls — model ${row.extraction_model}`
);
console.log(`call record keys: ${Object.keys(calls[0] ?? {}).join(", ")}\n`);

// --- structured pass: pull activity-shaped objects out of every response ----
function* walk(node) {
  if (Array.isArray(node)) {
    for (const v of node) yield* walk(v);
  } else if (node && typeof node === "object") {
    yield node;
    for (const v of Object.values(node)) yield* walk(v);
  }
}
function responseBlobs(call) {
  const out = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };
  for (const [k, v] of Object.entries(call)) {
    if (/response|output|result|completion|body|text|content/i.test(k)) {
      if (typeof v === "string") push(v);
      else if (v) push(JSON.stringify(v));
    }
  }
  if (!out.length) out.push(JSON.stringify(call));
  return out;
}

const titles = [];
for (const call of calls) {
  for (const blob of responseBlobs(call)) {
    let parsed = null;
    try {
      parsed = JSON.parse(blob);
    } catch {
      const m = blob.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* not JSON — the raw pass below still covers it */
        }
      }
    }
    if (!parsed) continue;
    for (const node of walk(parsed)) {
      const t = node.title ?? node.name;
      if (typeof t === "string" && t.trim()) {
        titles.push({
          title: t.trim(),
          date: node.date ?? null,
          desc:
            typeof node.description === "string"
              ? node.description.slice(0, 160)
              : null,
          node,
        });
      }
    }
  }
}
console.log(`=== ${titles.length} titled objects found in model output ===`);
for (const tok of TOKENS) {
  const asTitle = titles.filter((t) =>
    t.title.toLowerCase().includes(tok.toLowerCase())
  );
  const inDesc = titles.filter(
    (t) => t.desc && t.desc.toLowerCase().includes(tok.toLowerCase())
  );
  console.log(
    `\n--- ${tok} --- as TITLE: ${asTitle.length} | inside a DESCRIPTION: ${inDesc.length}`
  );
  for (const t of asTitle.slice(0, 4)) {
    console.log(`    TITLE  "${t.title}"  date=${t.date ?? "-"}`);
    if (DUMP) {
      // Scalars only: the point is the CLASSIFICATION fields the model
      // emitted (sourceSectionType, sourceSectionLabel, evidenceRole,
      // itemType, startTime, area). Nested arrays/objects would bury them.
      const scalars = Object.entries(t.node)
        .filter(([, v]) => v === null || typeof v !== "object")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
      console.log(`           ${scalars.join("  ")}`);
      const headingPath = t.node.sourceHeadingPath;
      if (Array.isArray(headingPath) && headingPath.length) {
        console.log(`           sourceHeadingPath=${JSON.stringify(headingPath)}`);
      }
    }
  }
  for (const t of inDesc.slice(0, 3)) {
    console.log(`    DESC   under "${t.title}": ${t.desc}`);
  }
}

// --- raw pass: catch anything the structured walk missed --------------------
console.log(`\n=== raw occurrences across all ${calls.length} pinned calls ===`);
const raw = JSON.stringify(calls);
for (const tok of TOKENS) {
  const n = (raw.match(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || [])
    .length;
  console.log(`${tok}: ${n}`);
}

console.log(`
=== how to read this ===
Token appears as a TITLE  -> the model emitted it as its own item, and anything
                             that later collapsed it did so in ASSEMBLY (code
                             bug, deterministic, cheap to fix).
Token only inside a DESC  -> the model already folded it into prose, so this is
                             an EXTRACTION/prompt problem, not an assembly one.
`);
