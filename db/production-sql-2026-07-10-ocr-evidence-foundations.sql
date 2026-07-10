-- Additive P0 foundation for complete OCR page batches and canonical evidence.
-- Run in the Supabase SQL editor before deploying the matching application code.

create table if not exists trip_material_ocr_batches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  upload_id uuid not null references trip_uploads(id) on delete cascade,
  material_extraction_id uuid not null references trip_material_extractions(id) on delete cascade,
  source_sha256 text not null,
  page_start integer not null,
  page_end integer not null,
  prompt_version text not null,
  status text not null default 'processing',
  attempt_count integer not null default 1,
  model text,
  max_output_tokens integer not null default 0,
  output_char_count integer not null default 0,
  text_content text,
  usage jsonb,
  incomplete_reason text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (page_start > 0 and page_end >= page_start)
);

create table if not exists trip_evidence_observations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  processing_run_id uuid not null references trip_processing_runs(id) on delete cascade,
  observation_id text not null,
  evidence_kind text not null,
  ordinal integer not null,
  source_type text not null,
  source_label text not null,
  source_filename text,
  source_upload_id uuid references trip_uploads(id) on delete set null,
  source_provenance text,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists trip_canonical_pieces (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  processing_run_id uuid not null references trip_processing_runs(id) on delete cascade,
  canonical_piece_id text not null,
  evidence_kind text not null,
  confidence text not null,
  output_eligible boolean not null default true,
  observation_ids jsonb not null default '[]'::jsonb,
  field_sources_json jsonb not null default '{}'::jsonb,
  conflicts_json jsonb not null default '[]'::jsonb,
  merge_reasons jsonb not null default '[]'::jsonb,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table trip_material_ocr_batches enable row level security;
alter table trip_evidence_observations enable row level security;
alter table trip_canonical_pieces enable row level security;

grant select, insert, update, delete on trip_material_ocr_batches to authenticated, service_role;
grant select, insert, update, delete on trip_evidence_observations to authenticated, service_role;
grant select, insert, update, delete on trip_canonical_pieces to authenticated, service_role;

create unique index if not exists trip_material_ocr_batches_identity_idx
  on trip_material_ocr_batches(
    material_extraction_id,
    source_sha256,
    page_start,
    page_end,
    prompt_version
  );

create index if not exists trip_material_ocr_batches_trip_status_idx
  on trip_material_ocr_batches(trip_id, status, page_start);

create unique index if not exists trip_evidence_observations_run_identity_idx
  on trip_evidence_observations(processing_run_id, observation_id);

create index if not exists trip_evidence_observations_trip_run_idx
  on trip_evidence_observations(trip_id, processing_run_id, ordinal);

create unique index if not exists trip_canonical_pieces_run_identity_idx
  on trip_canonical_pieces(processing_run_id, canonical_piece_id);

create index if not exists trip_canonical_pieces_trip_run_idx
  on trip_canonical_pieces(trip_id, processing_run_id, evidence_kind);

drop policy if exists "Trip owners can manage material OCR batches" on trip_material_ocr_batches;
create policy "Trip owners can manage material OCR batches"
  on trip_material_ocr_batches
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_material_ocr_batches.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_material_ocr_batches.trip_id
        and trips.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from trip_material_extractions
      where trip_material_extractions.id = trip_material_ocr_batches.material_extraction_id
        and trip_material_extractions.trip_id = trip_material_ocr_batches.trip_id
        and trip_material_extractions.upload_id = trip_material_ocr_batches.upload_id
    )
  );

drop policy if exists "Trip owners can manage evidence observations" on trip_evidence_observations;
create policy "Trip owners can manage evidence observations"
  on trip_evidence_observations
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_evidence_observations.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_evidence_observations.trip_id
        and trips.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from trip_processing_runs
      where trip_processing_runs.id = trip_evidence_observations.processing_run_id
        and trip_processing_runs.trip_id = trip_evidence_observations.trip_id
    )
  );

drop policy if exists "Trip owners can manage canonical pieces" on trip_canonical_pieces;
create policy "Trip owners can manage canonical pieces"
  on trip_canonical_pieces
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_canonical_pieces.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_canonical_pieces.trip_id
        and trips.owner_user_id = auth.uid()
    )
    and exists (
      select 1 from trip_processing_runs
      where trip_processing_runs.id = trip_canonical_pieces.processing_run_id
        and trip_processing_runs.trip_id = trip_canonical_pieces.trip_id
    )
  );
