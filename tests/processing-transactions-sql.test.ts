import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const sql = readFileSync(
  join(
    process.cwd(),
    "db",
    "production-sql-2026-07-08-processing-transactions-and-events.sql"
  ),
  "utf8"
);

test("processing transaction SQL creates the event table and transactional RPCs", () => {
  assert.match(sql, /create table if not exists trip_processing_events/i);
  assert.match(sql, /create or replace function complete_trip_processing_run/i);
  assert.match(sql, /create or replace function fail_trip_processing_run/i);
  assert.match(sql, /create or replace function publish_trip_snapshot/i);
});

test("processing transaction SQL locks trip and run state before committing", () => {
  assert.match(sql, /from trips[\s\S]*for update/i);
  assert.match(sql, /from trip_processing_runs[\s\S]*for update/i);
  assert.match(sql, /v_run_status = 'completed'[\s\S]*run_already_completed/i);
});

test("processing transaction SQL grants app roles explicit execute permission", () => {
  assert.match(sql, /revoke execute on function complete_trip_processing_run/i);
  assert.match(sql, /revoke execute on function fail_trip_processing_run/i);
  assert.match(sql, /revoke execute on function publish_trip_snapshot/i);
  assert.match(sql, /grant execute on function complete_trip_processing_run/i);
  assert.match(sql, /grant execute on function fail_trip_processing_run/i);
  assert.match(sql, /grant execute on function publish_trip_snapshot/i);
});
