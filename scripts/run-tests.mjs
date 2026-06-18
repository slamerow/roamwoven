import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import ts from "typescript";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
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

      return entry.isFile() && entry.name.endsWith(".test.ts")
        ? [fullPath]
        : [];
    })
    .sort();
}

const require = Module.createRequire(import.meta.url);
const testFiles = listTestFiles(path.join(rootDir, "tests"));

if (testFiles.length === 0) {
  console.log("No tests found.");
  process.exit(0);
}

for (const file of testFiles) {
  require(file);
}

console.log(`Passed ${testFiles.length} test file${testFiles.length === 1 ? "" : "s"}.`);
