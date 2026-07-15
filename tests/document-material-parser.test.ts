import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  extractCsvMaterial,
  extractDocxMaterial,
  extractXlsxMaterial,
} from "@/lib/extraction/document-material-parser";
import { MaterialParserError } from "@/lib/extraction/material-parser-errors";
import { inspectOfficeArchive } from "@/lib/extraction/office-archive";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function createRealDocxFixture() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
    </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
      <Relationship Id="rIdBooking" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/booking" TargetMode="External"/>
    </Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Central Europe</w:t></w:r></w:p>
        <w:p><w:r><w:t>Prague stay: Hotel Josef</w:t></w:r></w:p>
        <w:p><w:ins w:id="1"><w:r><w:t>Inserted Vienna walking route</w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>Deleted Bratislava detour</w:delText></w:r></w:del></w:p>
        <w:p><w:hyperlink r:id="rIdBooking"><w:r><w:t>Booking link</w:t></w:r></w:hyperlink></w:p>
        <w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Schönbrunn Palace</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>
        <w:tbl>
          <w:tr><w:tc><w:p><w:r><w:t>Date</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Plan</w:t></w:r></w:p></w:tc></w:tr>
          <w:tr><w:tc><w:p><w:r><w:t>2026-09-12</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Belvedere tickets</w:t></w:r></w:p></w:tc></w:tr>
        </w:tbl>
        <w:sectPr/>
      </w:body>
    </w:document>`
  );
  zip.file(
    "word/comments.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:comment w:id="0" w:author="Eli"><w:p><w:r><w:t>Book the Grand Tour before Friday.</w:t></w:r></w:p></w:comment>
    </w:comments>`
  );

  return zip.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
}

async function createRealXlsxFixture() {
  const workbook = new ExcelJS.Workbook();
  const visible = workbook.addWorksheet("Vienna Plan");
  visible.getCell("A1").value = "Date";
  visible.getCell("B1").value = "Plan";
  visible.getCell("A2").value = new Date("2026-09-12T08:30:00.000Z");
  visible.getCell("B2").value = "Schönbrunn Palace";
  visible.getCell("B2").note = "Timed entry at 9:00 AM";
  visible.getCell("C2").value = {
    hyperlink: "https://example.com/schonbrunn",
    text: "Ticket",
  };
  visible.getCell("D2").value = "HIDDEN COLUMN SECRET";
  visible.getColumn(4).hidden = true;
  visible.getCell("A3").value = "HIDDEN ROW SECRET";
  visible.getRow(3).hidden = true;
  visible.mergeCells("A4:B4");
  visible.getCell("A4").value = "Continuous Vienna walking route";
  visible.getCell("A5").value = { formula: "1+1", result: 2 };
  visible.getCell("B5").value = { formula: "2+2" };

  const hidden = workbook.addWorksheet("Private Scratchpad");
  hidden.state = "hidden";
  hidden.getCell("A1").value = "HIDDEN SHEET SECRET";

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const imageBuffer = Buffer.concat([onePixelPng, Buffer.alloc(9_000)]);
  const imageId = workbook.addImage({
    base64: `data:image/png;base64,${imageBuffer.toString("base64")}`,
    extension: "png",
  });
  visible.addImage(imageId, "A7:B12");

  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

export default async function run() {
  await test("real DOCX keeps visible structure, links, comments, and final tracked text", async () => {
    const result = await extractDocxMaterial({
      buffer: await createRealDocxFixture(),
      filename: "central-europe.docx",
      ocrImage: async () => "",
    });

    assert.match(result.text, /Central Europe/);
    assert.match(result.text, /Prague stay: Hotel Josef/);
    assert.match(result.text, /Inserted Vienna walking route/);
    assert.doesNotMatch(result.text, /Deleted Bratislava detour/);
    assert.match(result.text, /https:\/\/example\.com\/booking/);
    assert.match(result.text, /Belvedere tickets/);
    assert.match(result.text, /Book the Grand Tour before Friday/);
    assert.equal(
      result.metadata.trackedChangesPolicy,
      "insertions_included_deletions_ignored"
    );
  });

  await test("real XLSX uses visible cells, cached formula results, notes, links, merges, and image OCR", async () => {
    let ocrCalls = 0;
    const result = await extractXlsxMaterial({
      buffer: await createRealXlsxFixture(),
      filename: "vienna-plan.xlsx",
      ocrImage: async () => {
        ocrCalls += 1;
        return "Vienna ticket screenshot: Grand Tour 09:00";
      },
    });

    assert.match(result.text, /# Sheet: Vienna Plan/);
    assert.match(result.text, /Schönbrunn Palace/);
    assert.match(result.text, /Timed entry at 9:00 AM/);
    assert.match(result.text, /https:\/\/example\.com\/schonbrunn/);
    assert.match(result.text, /Merged cells: A4:B4/);
    assert.match(result.text, /A5: 2/);
    assert.match(result.text, /displayed formula result unavailable/);
    assert.match(result.text, /Vienna ticket screenshot: Grand Tour 09:00/);
    assert.doesNotMatch(result.text, /HIDDEN COLUMN SECRET/);
    assert.doesNotMatch(result.text, /HIDDEN ROW SECRET/);
    assert.doesNotMatch(result.text, /HIDDEN SHEET SECRET/);
    assert.equal(ocrCalls, 1);
    assert.equal(result.metadata.formulaExecutionPolicy, "cached_display_results_only");
    assert.equal(result.metadata.hiddenSheetCount, 1);
  });

  await test("CSV is parsed as one structured sheet without executing formulas", () => {
    const result = extractCsvMaterial({
      buffer: Buffer.from(
        'Date,Plan,Link\n2026-09-12,"Lunch, then palace","=HYPERLINK(""https://example.com"",""Ticket"")"\n'
      ),
      filename: "vienna.csv",
    });

    assert.match(result.text, /# Sheet: vienna\.csv/);
    assert.match(result.text, /Lunch, then palace/);
    assert.match(result.text, /=HYPERLINK/);
    assert.equal(result.metadata.formulaExecutionPolicy, "never_execute");
  });

  await test("Office archive preflight rejects encrypted legacy containers", async () => {
    const compoundFile = Buffer.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);

    await assert.rejects(
      () => inspectOfficeArchive({ buffer: compoundFile, expectedRoot: "word" }),
      (error: unknown) =>
        error instanceof MaterialParserError &&
        error.failureClass === "office_encrypted_or_legacy"
    );
  });

  await test("Office archive preflight rejects zip-bomb compression ratios", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types />");
    zip.file("word/document.xml", "A".repeat(2 * 1024 * 1024));
    const buffer = await zip.generateAsync({
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      type: "nodebuffer",
    });

    await assert.rejects(
      () => inspectOfficeArchive({ buffer, expectedRoot: "word" }),
      (error: unknown) =>
        error instanceof MaterialParserError &&
        error.failureClass === "office_archive_limit_exceeded"
    );
  });
}
