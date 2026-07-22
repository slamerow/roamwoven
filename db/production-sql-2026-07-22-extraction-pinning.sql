-- Additive foundation for extraction pinning (Arc E).
-- Run in the Supabase SQL editor BEFORE deploying the matching application
-- code. Purely additive: no existing table is altered. Undo: drop table
-- trip_extraction_parses (no other object references it).

create table if not exists trip_extraction_parses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  parse_key text not null,
  extraction_model text not null,
  sampling_params jsonb not null default '{}'::jsonb,
  material_fingerprints jsonb not null default '[]'::jsonb,
  calls_json jsonb not null default '[]'::jsonb,
  stats_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trip_extraction_parses enable row level security;

grant select, insert, update, delete on trip_extraction_parses to authenticated, service_role;

create unique index if not exists trip_extraction_parses_identity_idx
  on trip_extraction_parses(trip_id, parse_key);

create index if not exists trip_extraction_parses_trip_idx
  on trip_extraction_parses(trip_id, updated_at desc);

drop policy if exists "Trip owners can manage extraction parses" on trip_extraction_parses;
create policy "Trip owners can manage extraction parses"
  on trip_extraction_parses
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_extraction_parses.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_extraction_parses.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );
