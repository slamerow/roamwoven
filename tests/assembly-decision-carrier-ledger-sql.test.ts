import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export default function run() {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "db/production-sql-2026-08-09-assembly-decision-carrier-ledger.sql"
    ),
    "utf8"
  );
  assert.match(sql, /create table if not exists trip_assembly_decision_sets/i);
  assert.match(sql, /unique \(processing_run_id, schema_version\)/i);
  assert.match(
    sql,
    /create unique index if not exists trip_extraction_fact_sets_dependency_unique[\s\S]*trip_id,[\s\S]*processing_run_id,[\s\S]*schema_version,[\s\S]*ledger_hash/i
  );
  assert.match(
    sql,
    /foreign key \([\s\S]*trip_id,[\s\S]*processing_run_id,[\s\S]*source_fact_ledger_schema_version,[\s\S]*source_fact_ledger_hash[\s\S]*\)[\s\S]*references trip_extraction_fact_sets\([\s\S]*trip_id,[\s\S]*processing_run_id,[\s\S]*schema_version,[\s\S]*ledger_hash/i
  );
  assert.match(sql, /pg_column_size\(decisions_json\) < 1048576/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select/i);
  assert.match(sql, /for insert/i);
  assert.match(sql, /for select\s+to authenticated/i);
  assert.match(sql, /for insert\s+to authenticated/i);
  assert.match(
    sql,
    /revoke all on trip_assembly_decision_sets from anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /create index if not exists trip_assembly_decision_sets_source_fact_dependency_idx[\s\S]*trip_id,[\s\S]*processing_run_id,[\s\S]*source_fact_ledger_schema_version,[\s\S]*source_fact_ledger_hash/i
  );
  assert.match(sql, /owner_user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /owner_user_id = auth\.uid\(\)/i);
  assert.match(sql, /grant select, insert .* authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*\bupdate\b/i);
  assert.doesNotMatch(sql, /grant[^;]*\bdelete\b/i);
  assert.doesNotMatch(sql, /grant[^;]*\btruncate\b/i);
  assert.doesNotMatch(sql, /for update/i);
  assert.doesNotMatch(sql, /for delete/i);
  assert.doesNotMatch(sql, /using gin/i);
  assert.equal(
    sql
      .split(";")
      .filter((statement) => /create\s+(?:unique\s+)?index/i.test(statement))
      .some((statement) => /decisions_json|metrics_json/i.test(statement)),
    false,
    "private decision JSON receives no full-content index"
  );
}
