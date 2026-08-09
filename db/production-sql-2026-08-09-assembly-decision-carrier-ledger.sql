-- Additive Assembly Decision & Carrier Ledger V1 shadow persistence.
-- Run after the Source Fact Ledger V1 patch and before setting
-- ASSEMBLY_DECISION_LEDGER_SHADOW=1. Do not enable the decision flag unless
-- EXTRACTION_FACT_LEDGER_SHADOW=1 is also enabled and healthy.

-- PostgreSQL permits a foreign key to target a matching non-partial unique
-- index. This adds only the dependency key required by the companion ledger;
-- it does not alter Source Fact Ledger V1 facts, hashes, or stored fields.
create unique index if not exists trip_extraction_fact_sets_dependency_unique
  on trip_extraction_fact_sets(
    trip_id,
    processing_run_id,
    schema_version,
    ledger_hash
  );

create table if not exists trip_assembly_decision_sets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  processing_run_id uuid not null references trip_processing_runs(id) on delete cascade,
  schema_version integer not null,
  source_fact_ledger_schema_version integer not null,
  source_fact_ledger_hash text not null,
  decision_set_hash text not null,
  decisions_json jsonb not null,
  metrics_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint trip_assembly_decision_sets_run_schema_unique
    unique (processing_run_id, schema_version),
  constraint trip_assembly_decision_sets_source_fact_dependency
    foreign key (
      trip_id,
      processing_run_id,
      source_fact_ledger_schema_version,
      source_fact_ledger_hash
    )
    references trip_extraction_fact_sets(
      trip_id,
      processing_run_id,
      schema_version,
      ledger_hash
    )
    on delete cascade,
  constraint trip_assembly_decision_sets_schema_positive
    check (schema_version > 0),
  constraint trip_assembly_decision_sets_source_schema_positive
    check (source_fact_ledger_schema_version > 0),
  constraint trip_assembly_decision_sets_source_hash_shape
    check (source_fact_ledger_hash ~ '^[0-9a-f]{64}$'),
  constraint trip_assembly_decision_sets_hash_shape
    check (decision_set_hash ~ '^[0-9a-f]{64}$'),
  constraint trip_assembly_decision_sets_decisions_object
    check (jsonb_typeof(decisions_json) = 'object'),
  constraint trip_assembly_decision_sets_metrics_object
    check (jsonb_typeof(metrics_json) = 'object'),
  constraint trip_assembly_decision_sets_size_gate
    check (pg_column_size(decisions_json) < 1048576)
);

alter table trip_assembly_decision_sets enable row level security;

revoke all on trip_assembly_decision_sets from anon, authenticated, service_role;
grant select, insert on trip_assembly_decision_sets to authenticated, service_role;

create index if not exists trip_assembly_decision_sets_trip_created_idx
  on trip_assembly_decision_sets(trip_id, created_at desc);

create index if not exists trip_assembly_decision_sets_source_fact_dependency_idx
  on trip_assembly_decision_sets(
    trip_id,
    processing_run_id,
    source_fact_ledger_schema_version,
    source_fact_ledger_hash
  );

drop policy if exists "Trip owners can read assembly decision sets"
  on trip_assembly_decision_sets;
create policy "Trip owners can read assembly decision sets"
  on trip_assembly_decision_sets
  for select
  to authenticated
  using (
    exists (
      select 1 from trips
      where trips.id = trip_assembly_decision_sets.trip_id
        and trips.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "Trip owners can append assembly decision sets"
  on trip_assembly_decision_sets;
create policy "Trip owners can append assembly decision sets"
  on trip_assembly_decision_sets
  for insert
  to authenticated
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_assembly_decision_sets.trip_id
        and trips.owner_user_id = (select auth.uid())
    )
    and exists (
      select 1 from trip_processing_runs
      where trip_processing_runs.id = trip_assembly_decision_sets.processing_run_id
        and trip_processing_runs.trip_id = trip_assembly_decision_sets.trip_id
    )
  );
