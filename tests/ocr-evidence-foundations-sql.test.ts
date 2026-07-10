import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "db/production-sql-2026-07-10-ocr-evidence-foundations.sql"
  ),
  "utf8"
);

export default async function run() {
  await test("OCR and evidence foundation SQL creates durable run artifacts", () => {
    assert.match(sql, /create table if not exists trip_material_ocr_batches/i);
    assert.match(sql, /create table if not exists trip_evidence_observations/i);
    assert.match(sql, /create table if not exists trip_canonical_pieces/i);
    assert.match(
      sql,
      /material_extraction_id,\s*source_sha256,\s*page_start,\s*page_end,\s*prompt_version/i
    );
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /trip_processing_runs\.trip_id = trip_canonical_pieces\.trip_id/i);
  });
}
