import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function createTextPdf(text) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${
      44 + text.length
    } >>\nstream\nBT /F1 24 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "utf8"));
}

export default async function run() {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const source = fs.readFileSync(
    path.join(rootDir, "lib/extraction/trip-materials.ts"),
    "utf8"
  );

  assert.match(
    source,
    /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/,
    "PDF extraction must preload the pdf.js worker so Vercel does not look for a missing runtime chunk"
  );

  globalThis.DOMMatrix ??= class MinimalDOMMatrix {
    constructor(init) {
      if (Array.isArray(init)) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
  };

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

  assert.ok(
    globalThis.pdfjsWorker?.WorkerMessageHandler,
    "expected pdf.js worker preload to register a fake-worker handler"
  );

  const expected = "Roamwoven PDF worker smoke test";
  const task = pdfjs.getDocument({
    data: createTextPdf(expected),
    isEvalSupported: false,
  });
  const document = await task.promise;

  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    page.cleanup();

    assert.match(text, /Roamwoven PDF worker smoke test/);
    console.log("ok - pdf.js worker preload extracts readable PDF text");
  } finally {
    await document.destroy();
  }
}
