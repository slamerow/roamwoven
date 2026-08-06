import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export default function run() {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "db/production-sql-2026-08-07-source-fact-ledger.sql"
    ),
    "utf8"
  );
  assert.match(sql, /create table if not exists trip_extraction_fact_sets/i);
  assert.match(sql, /unique \(processing_run_id, schema_version\)/i);
  assert.match(sql, /references trips\(id\) on delete cascade/i);
  assert.match(sql, /references trip_processing_runs\(id\) on delete cascade/i);
  assert.match(sql, /pg_column_size\(facts_json\) < 1048576/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select/i);
  assert.match(sql, /for insert/i);
  assert.match(sql, /grant select, insert .* authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*\bupdate\b/i);
  assert.doesNotMatch(sql, /for update/i);
  assert.doesNotMatch(sql, /using gin/i);
  assert.equal(
    sql
      .split(";")
      .filter((statement) => /create\s+(?:unique\s+)?index/i.test(statement))
      .some((statement) => /facts_json|metrics_json/i.test(statement)),
    false,
    "private JSON receives no full-content index"
  );
}
