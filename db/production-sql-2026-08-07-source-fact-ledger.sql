-- Additive Source Fact Ledger V1 shadow persistence.
-- Run before setting EXTRACTION_FACT_LEDGER_SHADOW=1.

create table if not exists trip_extraction_fact_sets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  processing_run_id uuid not null references trip_processing_runs(id) on delete cascade,
  schema_version integer not null,
  source_fingerprint text not null,
  ledger_hash text not null,
  facts_json jsonb not null,
  metrics_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint trip_extraction_fact_sets_run_schema_unique
    unique (processing_run_id, schema_version),
  constraint trip_extraction_fact_sets_schema_positive
    check (schema_version > 0),
  constraint trip_extraction_fact_sets_source_fingerprint_shape
    check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint trip_extraction_fact_sets_ledger_hash_shape
    check (ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint trip_extraction_fact_sets_facts_object
    check (jsonb_typeof(facts_json) = 'object'),
  constraint trip_extraction_fact_sets_metrics_object
    check (jsonb_typeof(metrics_json) = 'object'),
  constraint trip_extraction_fact_sets_size_gate
    check (pg_column_size(facts_json) < 1048576)
);

alter table trip_extraction_fact_sets enable row level security;

revoke all on trip_extraction_fact_sets from anon, authenticated;
grant select, insert on trip_extraction_fact_sets to authenticated, service_role;

create index if not exists trip_extraction_fact_sets_trip_created_idx
  on trip_extraction_fact_sets(trip_id, created_at desc);

create index if not exists trip_extraction_fact_sets_run_idx
  on trip_extraction_fact_sets(processing_run_id);

drop policy if exists "Trip owners can read extraction fact sets"
  on trip_extraction_fact_sets;
create policy "Trip owners can read extraction fact sets"
  on trip_extraction_fact_sets
  for select
  using (
    exists (
      select 1 from trips
      where trips.id = trip_extraction_fact_sets.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

drop policy if exists "Trip owners can append extraction fact sets"
  on trip_extraction_fact_sets;
create policy "Trip owners can append extraction fact sets"
  on trip_extraction_fact_sets
  for insert
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_extraction_fact_sets.trip_id
        and trips.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from trip_processing_runs
      where trip_processing_runs.id = trip_extraction_fact_sets.processing_run_id
        and trip_processing_runs.trip_id = trip_extraction_fact_sets.trip_id
    )
  );
