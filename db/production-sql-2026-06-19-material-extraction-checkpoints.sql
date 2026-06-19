create table if not exists trip_material_extractions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  upload_id uuid not null references trip_uploads(id) on delete cascade,
  status text not null default 'pending',
  extraction_method text,
  extracted_char_count integer not null default 0,
  text_content text,
  failure_class text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table trip_material_extractions enable row level security;

grant select, insert, update, delete on trip_material_extractions to anon;
grant select, insert, update, delete on trip_material_extractions to authenticated;
grant select, insert, update, delete on trip_material_extractions to service_role;

create index if not exists trip_material_extractions_trip_id_idx
  on trip_material_extractions(trip_id, created_at asc);

create unique index if not exists trip_material_extractions_upload_id_idx
  on trip_material_extractions(upload_id);

create index if not exists trip_material_extractions_status_idx
  on trip_material_extractions(trip_id, status);

drop policy if exists "Trip owners can manage material extractions" on trip_material_extractions;

create policy "Trip owners can manage material extractions"
  on trip_material_extractions
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_material_extractions.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_material_extractions.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );
