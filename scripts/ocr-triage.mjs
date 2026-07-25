// OCR triage — separates "OpenAI is degraded" from "this request shape fails".
//
// Runs four probes against api.openai.com/v1/responses and prints a matrix.
// Each probe is tiny; total spend is a fraction of a cent.
//
//   node scripts/ocr-triage.mjs
//   node scripts/ocr-triage.mjs "USE FOR TESTING CZECH.pdf"
//
// The four probes vary TWO things independently — the model, and whether the
// request carries an image — so the failure pattern names the cause instead of
// leaving you to guess from a single 500:
//
//   1. text  + gpt-5.4-mini   is the API reachable AT ALL with this key?
//   2. text  + gpt-5.6-luna   is the OCR MODEL itself alive?
//   3. image + gpt-5.6-luna   does ONE page work? (small vision payload)
//   4. image + gpt-5.6-luna   do FOUR pages work? (production's batch size)
//
// Reading the result:
//   all four fail ................ OpenAI-side outage; wait it out
//   1 ok, 2 fails ................ gpt-5.6-luna specifically is degraded/retired
//   1+2 ok, 3 fails .............. the vision lane is broken, any payload size
//   1+2+3 ok, 4 fails ............ PAYLOAD SIZE — drop OPENAI_OCR_PDF_BATCH_PAGES
//   all four pass ................ it was transient; re-run the smoke test
//
// Probe 4 is the one that reproduces the live failure, so it runs last.

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

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY not found in environment or .env.local");
  process.exit(2);
}

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

const require2 = Module.createRequire(import.meta.url);

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const TEXT_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.4-mini";
const OCR_MODEL = process.env.OPENAI_OCR_MODEL ?? "gpt-5.6-luna";

const fileArg = process.argv[2] ?? "USE FOR TESTING CZECH.pdf";
const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(rootDir, fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`file not found: ${filePath}`);
  process.exit(2);
}

// Build real page batches with the SAME code production uses, so probe 3 and
// probe 4 differ ONLY in how many pages ride along.
const batchModule = require2(path.join(rootDir, "lib/extraction/pdf-page-batches.ts"));
const batcher = await batchModule.createPdfPageBatcher(
  new Uint8Array(fs.readFileSync(filePath))
);

// A stalled request is itself a finding, so every probe is bounded and a
// timeout is REPORTED rather than left as silence.
const PROBE_TIMEOUT_MS = Number(process.env.OCR_TRIAGE_TIMEOUT_MS ?? 90000);

async function callOpenAI({ body, label }) {
  const started = Date.now();
  let response;
  let text;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    const timedOut =
      error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      elapsedMs: Date.now() - started,
      label,
      note: timedOut
        ? `NO RESPONSE within ${PROBE_TIMEOUT_MS / 1000}s — the request was ` +
          `accepted but never answered. A stall is a server-side symptom, not a ` +
          `client one.`
        : `network error: ${error?.message ?? error}`,
      ok: false,
      status: timedOut ? "STALL" : null,
    };
  }
  const elapsedMs = Date.now() - started;
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* leave null */
  }
  const requestId = response.headers.get("x-request-id");
  return {
    elapsedMs,
    label,
    note: response.ok
      ? `${(parsed?.output_text ?? "").slice(0, 40) || "(response received)"}`
      : `${parsed?.error?.message ?? text.slice(0, 160)}${
          requestId ? `  [request-id ${requestId}]` : ""
        }`,
    ok: response.ok,
    status: response.status,
  };
}

function textProbe(model) {
  return {
    input: "Reply with the single word: ok",
    max_output_tokens: 16,
    model,
    service_tier: "default",
    store: false,
  };
}

async function imageProbe(model, pageNumbers) {
  const batch = await batcher.createBatch(pageNumbers);
  return {
    input: [
      {
        content: [
          {
            file_data: `data:application/pdf;base64,${batch.base64}`,
            filename: "probe.pdf",
            type: "input_file",
          },
          {
            text: "Transcribe any visible text. Plain text only.",
            type: "input_text",
          },
        ],
        role: "user",
      },
    ],
    max_output_tokens: 512,
    model,
    service_tier: "default",
    store: false,
  };
}

console.log(`file       : ${path.basename(filePath)} (${batcher.pageCount} pages)`);
console.log(`text model : ${TEXT_MODEL}`);
console.log(`ocr model  : ${OCR_MODEL}`);
console.log(`endpoint   : ${OPENAI_RESPONSES_URL}\n`);

// Each row prints THE MOMENT it resolves. Buffering them to the end meant a
// single hung probe produced no output at all and the run looked dead.
console.log("RESULTS (each row prints as it completes)");
console.log("-".repeat(72));

const results = [];

async function runProbe(label, bodyFactory) {
  process.stdout.write(`....  ${label.padEnd(34)} running...`);
  const result = await callOpenAI({ body: await bodyFactory(), label });
  process.stdout.write("\r\x1b[K");
  console.log(
    `${result.ok ? "PASS" : "FAIL"}  ${result.label.padEnd(34)} ` +
      `${String(result.status ?? "---").padStart(5)}  ${String(result.elapsedMs).padStart(6)} ms`
  );
  console.log(`      ${result.note}`);
  results.push(result);
  return result;
}

await runProbe(`1. text  + ${TEXT_MODEL}`, () => textProbe(TEXT_MODEL));
await runProbe(`2. text  + ${OCR_MODEL}`, () => textProbe(OCR_MODEL));
await runProbe(`3. image + ${OCR_MODEL} (1 page)`, () => imageProbe(OCR_MODEL, [1]));
await runProbe(`4. image + ${OCR_MODEL} (4 pages)`, () =>
  imageProbe(OCR_MODEL, [1, 2, 3, 4])
);

console.log("-".repeat(72));

const [apiUp, modelUp, onePage, fourPages] = results.map((result) => result.ok);

const anyStall = results.some((result) => result.status === "STALL");

let verdict;
if (anyStall) {
  verdict =
    "AT LEAST ONE PROBE STALLED -> the connection was accepted and never\n" +
    "         answered. That is a server-side symptom (or a proxy/VPN swallowing the\n" +
    "         response), never a code defect. Combined with the 500s, treat OpenAI as\n" +
    "         degraded and retry later. Do NOT change the model over this.";
} else if (!apiUp && !modelUp && !onePage && !fourPages) {
  verdict =
    "EVERYTHING FAILED -> OpenAI-side problem (or your key/billing). Not a code\n" +
    "         issue. Check the status page and retry later. If probe 1 shows 401 it is\n" +
    "         the key; 429 is quota.";
} else if (apiUp && !modelUp) {
  verdict =
    `"${OCR_MODEL}" IS THE PROBLEM -> the API answers for ${TEXT_MODEL} but not\n` +
    "         for the OCR model. It may be degraded or retired. Do NOT swap to a text-only\n" +
    "         model as a fix; find another VISION model and smoke-test it first.";
} else if (apiUp && modelUp && !onePage) {
  verdict =
    "THE VISION LANE IS BROKEN -> the model answers text but fails on ANY image\n" +
    "         payload. Not a size problem. Likely the model lost file/image input support.";
} else if (onePage && !fourPages) {
  verdict =
    "PAYLOAD SIZE -> one page works, four do not. Set OPENAI_OCR_PDF_BATCH_PAGES=1\n" +
    "         (or 2) in Vercel and re-run. This ALSO tests the omission lead for free.";
} else if (apiUp && modelUp && onePage && fourPages) {
  verdict =
    "ALL FOUR PASSED -> the earlier 500 was transient and has cleared. Re-run\n" +
    "         scripts/ocr-smoke-test.mjs to confirm, then go for the live run.";
} else {
  verdict = "MIXED -> read the rows above; the pattern does not match a known shape.";
}

console.log(`VERDICT: ${verdict}`);
console.log(
  "\nNote: a 500 is transient by definition. If the pattern looks random, run this\n" +
    "again in a few minutes before drawing a conclusion — one sample is not a trend."
);

process.exit(results.some((result) => !result.ok) ? 1 : 0);
