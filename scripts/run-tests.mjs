import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// fileURLToPath, not URL.pathname: on a repo path containing spaces
// ("Claude - Roamwoven") .pathname stays percent-encoded, the tests
// directory is never found, and the runner reported SUCCESS with zero
// tests — a silently vacuous local gate (caught 2026-07-24 on Eli's
// machine; same bug class as the replay harness fix in 78d041f).
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
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
      strict: true,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
    reportDiagnostics: true,
  });

  const diagnostics = output.diagnostics ?? [];
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );

  if (errors.length > 0) {
    const message = ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    });

    throw new Error(message);
  }

  module._compile(output.outputText, filename);
};

function listTestFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return listTestFiles(fullPath);
      }

      return entry.isFile() &&
        (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.mjs"))
        ? [fullPath]
        : [];
    })
    .sort();
}

const require = Module.createRequire(import.meta.url);
const testFiles = listTestFiles(path.join(rootDir, "tests"));

if (testFiles.length === 0) {
  // Zero tests is a broken gate, never a pass (dark-factory honesty).
  console.error("No tests found — refusing to report success.");
  process.exit(1);
}

for (const file of testFiles) {
  if (file.endsWith(".mjs")) {
    const module = await import(file);
    const run = module.default ?? module.run;

    if (typeof run === "function") {
      await run();
    }
  } else {
    const module = require(file);
    const run = module.default ?? module.run;

    if (typeof run === "function") {
      await run();
    }
  }
}

console.log(`Passed ${testFiles.length} test file${testFiles.length === 1 ? "" : "s"}.`);
