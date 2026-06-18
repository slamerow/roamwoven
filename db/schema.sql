create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text,
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  processing_status text not null default 'not_started',
  start_date date,
  end_date date,
  destination_summary text,
  color_palette text,
  theme_pack text not null default 'quiet_luxury',
  traveler_password_enabled boolean not null default true,
  traveler_password_hash text,
  photo_password_hash text,
  cover_image_url text,
  published_app_token text unique,
  token_rotated_at timestamptz,
  published_at timestamptz,
  photo_count integer not null default 0,
  photo_storage_bytes bigint not null default 0,
  photo_sharing_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_uploads (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  original_filename text not null,
  file_type text,
  file_size_bytes bigint,
  content_sha256 text,
  storage_path text,
  source_kind text not null default 'file',
  user_note text,
  detected_document_type text,
  classification_confidence numeric,
  processing_status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table if exists trip_uploads
  add column if not exists file_size_bytes bigint,
  add column if not exists content_sha256 text,
  add column if not exists source_kind text not null default 'file';

create table if not exists trip_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  leg_key text,
  country text,
  city text not null,
  arrive_date date,
  leave_date date,
  stay_name text,
  stay_address text,
  why text,
  timezone text,
  language text,
  latitude numeric,
  longitude numeric,
  status text not null default 'draft',
  review_required boolean not null default false,
  confidence numeric,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  leg_id uuid references trip_legs(id) on delete set null,
  item_key text,
  date date,
  start_time time,
  end_time time,
  title text not null,
  description text,
  category text,
  item_type text,
  location_name text,
  address text,
  address_visibility text not null default 'traveler',
  confirmation_number text,
  confirmation_visibility text not null default 'maker_only',
  url text,
  notes text,
  status text not null default 'draft',
  placeholder_type text,
  review_required boolean not null default false,
  confidence numeric,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_build_settings (
  trip_id uuid primary key references trips(id) on delete cascade,
  enabled_modules jsonb not null default '{}'::jsonb,
  confirmations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_style_settings (
  trip_id uuid primary key references trips(id) on delete cascade,
  app_name text,
  primary_color text not null default '#526247',
  secondary_color text,
  accent_color text,
  soft_color text,
  theme_direction text not null default 'rustic_adventure',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists trip_style_settings
  add column if not exists secondary_color text,
  add column if not exists accent_color text,
  add column if not exists soft_color text;

create table if not exists trip_processing_runs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  run_type text not null default 'initial_parse',
  idempotency_key text,
  source_upload_ids jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  model text,
  input_char_count integer not null default 0,
  openai_usage jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table if exists trip_processing_runs
  add column if not exists idempotency_key text,
  add column if not exists source_upload_ids jsonb not null default '[]'::jsonb;

create table if not exists trip_draft_snapshots (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  processing_run_id uuid references trip_processing_runs(id) on delete set null,
  source text not null default 'openai_initial_parse',
  draft_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists trip_review_decisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  action text not null,
  subject_type text not null,
  subject_id text not null,
  payload_json jsonb not null default '{}'::jsonb,
  note text,
  created_by_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists published_trip_snapshots (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  version integer not null default 1,
  share_token text not null unique,
  snapshot_json jsonb not null,
  created_by_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

alter table if exists trips
  add column if not exists published_snapshot_id uuid references published_trip_snapshots(id) on delete set null;

alter table trips enable row level security;
alter table trip_uploads enable row level security;
alter table trip_legs enable row level security;
alter table trip_items enable row level security;
alter table trip_build_settings enable row level security;
alter table trip_style_settings enable row level security;
alter table trip_processing_runs enable row level security;
alter table trip_draft_snapshots enable row level security;
alter table trip_review_decisions enable row level security;
alter table published_trip_snapshots enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on trips to anon;
grant select, insert, update, delete on trip_uploads to anon;
grant select, insert, update, delete on trip_legs to anon;
grant select, insert, update, delete on trip_items to anon;
grant select, insert, update, delete on trip_build_settings to anon;
grant select, insert, update, delete on trip_style_settings to anon;
grant select, insert, update, delete on trip_processing_runs to anon;
grant select, insert, update, delete on trip_draft_snapshots to anon;
grant select, insert, update, delete on trip_review_decisions to anon;
grant select, insert, update, delete on published_trip_snapshots to anon;
grant select, insert, update, delete on trips to authenticated;
grant select, insert, update, delete on trip_uploads to authenticated;
grant select, insert, update, delete on trip_legs to authenticated;
grant select, insert, update, delete on trip_items to authenticated;
grant select, insert, update, delete on trip_build_settings to authenticated;
grant select, insert, update, delete on trip_style_settings to authenticated;
grant select, insert, update, delete on trip_processing_runs to authenticated;
grant select, insert, update, delete on trip_draft_snapshots to authenticated;
grant select, insert, update, delete on trip_review_decisions to authenticated;
grant select, insert, update, delete on published_trip_snapshots to authenticated;
grant select, insert, update, delete on trips to service_role;
grant select, insert, update, delete on trip_uploads to service_role;
grant select, insert, update, delete on trip_legs to service_role;
grant select, insert, update, delete on trip_items to service_role;
grant select, insert, update, delete on trip_build_settings to service_role;
grant select, insert, update, delete on trip_style_settings to service_role;
grant select, insert, update, delete on trip_processing_runs to service_role;
grant select, insert, update, delete on trip_draft_snapshots to service_role;
grant select, insert, update, delete on trip_review_decisions to service_role;
grant select, insert, update, delete on published_trip_snapshots to service_role;

create index if not exists trips_owner_user_id_idx
  on trips(owner_user_id);

create index if not exists trips_owner_status_idx
  on trips(owner_user_id, status);

create index if not exists trip_uploads_trip_id_idx
  on trip_uploads(trip_id);

create unique index if not exists trip_uploads_trip_content_sha256_idx
  on trip_uploads(trip_id, content_sha256)
  where content_sha256 is not null;

create index if not exists trip_legs_trip_id_idx
  on trip_legs(trip_id);

create index if not exists trip_items_trip_id_idx
  on trip_items(trip_id);

create index if not exists trip_items_trip_date_idx
  on trip_items(trip_id, date);

create index if not exists trip_processing_runs_trip_id_idx
  on trip_processing_runs(trip_id, created_at desc);

create unique index if not exists trip_processing_runs_trip_idempotency_idx
  on trip_processing_runs(trip_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists trip_draft_snapshots_trip_id_idx
  on trip_draft_snapshots(trip_id, created_at desc);

create index if not exists trip_review_decisions_trip_id_idx
  on trip_review_decisions(trip_id, created_at asc);

create index if not exists trip_review_decisions_subject_idx
  on trip_review_decisions(trip_id, subject_type, subject_id);

create index if not exists published_trip_snapshots_trip_id_idx
  on published_trip_snapshots(trip_id, version desc);

create unique index if not exists published_trip_snapshots_trip_version_idx
  on published_trip_snapshots(trip_id, version);

drop policy if exists "Trip owners can manage trips" on trips;
drop policy if exists "Trip owners can manage uploads" on trip_uploads;
drop policy if exists "Trip owners can manage legs" on trip_legs;
drop policy if exists "Trip owners can manage items" on trip_items;
drop policy if exists "Trip owners can manage build settings" on trip_build_settings;
drop policy if exists "Trip owners can manage style settings" on trip_style_settings;
drop policy if exists "Trip owners can manage processing runs" on trip_processing_runs;
drop policy if exists "Trip owners can manage draft snapshots" on trip_draft_snapshots;
drop policy if exists "Trip owners can manage review decisions" on trip_review_decisions;
drop policy if exists "Trip owners can manage published snapshots" on published_trip_snapshots;

create policy "Trip owners can manage trips"
  on trips
  for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "Trip owners can manage uploads"
  on trip_uploads
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_uploads.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_uploads.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage legs"
  on trip_legs
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_legs.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_legs.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage items"
  on trip_items
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_items.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_items.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage build settings"
  on trip_build_settings
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_build_settings.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_build_settings.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage style settings"
  on trip_style_settings
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_style_settings.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_style_settings.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage processing runs"
  on trip_processing_runs
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_processing_runs.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_processing_runs.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage draft snapshots"
  on trip_draft_snapshots
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_draft_snapshots.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_draft_snapshots.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage review decisions"
  on trip_review_decisions
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = trip_review_decisions.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    created_by_user_id = auth.uid()
    and exists (
      select 1 from trips
      where trips.id = trip_review_decisions.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can manage published snapshots"
  on published_trip_snapshots
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = published_trip_snapshots.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    created_by_user_id = auth.uid()
    and exists (
      select 1 from trips
      where trips.id = published_trip_snapshots.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'trip-materials',
  'trip-materials',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Trip owners can read material files" on storage.objects;
drop policy if exists "Trip owners can upload material files" on storage.objects;
drop policy if exists "Trip owners can update material files" on storage.objects;
drop policy if exists "Trip owners can delete material files" on storage.objects;

create policy "Trip owners can read material files"
  on storage.objects
  for select
  using (
    bucket_id = 'trip-materials'
    and exists (
      select 1 from trips
      where trips.id::text = split_part(storage.objects.name, '/', 2)
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can upload material files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'trip-materials'
    and split_part(storage.objects.name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from trips
      where trips.id::text = split_part(storage.objects.name, '/', 2)
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can update material files"
  on storage.objects
  for update
  using (
    bucket_id = 'trip-materials'
    and exists (
      select 1 from trips
      where trips.id::text = split_part(storage.objects.name, '/', 2)
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'trip-materials'
    and split_part(storage.objects.name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from trips
      where trips.id::text = split_part(storage.objects.name, '/', 2)
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can delete material files"
  on storage.objects
  for delete
  using (
    bucket_id = 'trip-materials'
    and exists (
      select 1 from trips
      where trips.id::text = split_part(storage.objects.name, '/', 2)
        and trips.owner_user_id = auth.uid()
    )
  );
