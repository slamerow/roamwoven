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
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id) on delete set null,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists trips
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text;

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

create table if not exists trip_processing_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  processing_run_id uuid references trip_processing_runs(id) on delete set null,
  stage text not null,
  status text not null,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists trip_review_decisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  decision_key text not null,
  action text not null,
  subject_type text not null,
  subject_id text not null,
  payload_json jsonb not null default '{}'::jsonb,
  note text,
  created_by_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists trip_review_decisions
  add column if not exists decision_key text,
  add column if not exists updated_at timestamptz not null default now();

update trip_review_decisions
set decision_key = concat(trip_id::text, ':', subject_type, ':', subject_id, ':', action)
where decision_key is null;

alter table if exists trip_review_decisions
  alter column decision_key set not null;

create table if not exists trip_payment_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  event_id text,
  checkout_session_id text not null,
  payment_intent_id text,
  amount_total integer,
  currency text,
  status text not null,
  customer_email text,
  raw_event jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
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

create table if not exists published_trip_private_details (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references published_trip_snapshots(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  detail_id text not null,
  subject_type text not null,
  subject_id text not null,
  label text not null,
  reason text,
  value text not null,
  visibility text not null default 'traveler_password',
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
alter table trip_material_extractions enable row level security;
alter table trip_processing_events enable row level security;
alter table trip_review_decisions enable row level security;
alter table published_trip_snapshots enable row level security;
alter table published_trip_private_details enable row level security;
alter table trip_payment_events enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on trips to anon;
grant select, insert, update, delete on trip_uploads to anon;
grant select, insert, update, delete on trip_legs to anon;
grant select, insert, update, delete on trip_items to anon;
grant select, insert, update, delete on trip_build_settings to anon;
grant select, insert, update, delete on trip_style_settings to anon;
grant select, insert, update, delete on trip_processing_runs to anon;
grant select, insert, update, delete on trip_draft_snapshots to anon;
grant select, insert, update, delete on trip_material_extractions to anon;
grant select, insert, update, delete on trip_review_decisions to anon;
grant select, insert, update, delete on published_trip_snapshots to anon;
grant select, insert, update, delete on published_trip_private_details to anon;
grant select on trip_payment_events to anon;
grant select, insert, update, delete on trips to authenticated;
grant select, insert, update, delete on trip_uploads to authenticated;
grant select, insert, update, delete on trip_legs to authenticated;
grant select, insert, update, delete on trip_items to authenticated;
grant select, insert, update, delete on trip_build_settings to authenticated;
grant select, insert, update, delete on trip_style_settings to authenticated;
grant select, insert, update, delete on trip_processing_runs to authenticated;
grant select, insert, update, delete on trip_draft_snapshots to authenticated;
grant select, insert, update, delete on trip_material_extractions to authenticated;
grant select, insert on trip_processing_events to authenticated;
grant select, insert, update, delete on trip_review_decisions to authenticated;
grant select, insert, update, delete on published_trip_snapshots to authenticated;
grant select, insert, update, delete on published_trip_private_details to authenticated;
grant select on trip_payment_events to authenticated;
grant select, insert, update, delete on trips to service_role;
grant select, insert, update, delete on trip_uploads to service_role;
grant select, insert, update, delete on trip_legs to service_role;
grant select, insert, update, delete on trip_items to service_role;
grant select, insert, update, delete on trip_build_settings to service_role;
grant select, insert, update, delete on trip_style_settings to service_role;
grant select, insert, update, delete on trip_processing_runs to service_role;
grant select, insert, update, delete on trip_draft_snapshots to service_role;
grant select, insert, update, delete on trip_material_extractions to service_role;
grant select, insert, update, delete on trip_processing_events to service_role;
grant select, insert, update, delete on trip_review_decisions to service_role;
grant select, insert, update, delete on published_trip_snapshots to service_role;
grant select, insert, update, delete on published_trip_private_details to service_role;
grant select, insert, update, delete on trip_payment_events to service_role;

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

create index if not exists trip_material_extractions_trip_id_idx
  on trip_material_extractions(trip_id, created_at asc);

create unique index if not exists trip_material_extractions_upload_id_idx
  on trip_material_extractions(upload_id);

create index if not exists trip_material_extractions_status_idx
  on trip_material_extractions(trip_id, status);

create index if not exists trip_processing_events_trip_created_idx
  on trip_processing_events(trip_id, created_at desc);

create index if not exists trip_processing_events_run_created_idx
  on trip_processing_events(processing_run_id, created_at desc)
  where processing_run_id is not null;

create index if not exists trip_review_decisions_trip_id_idx
  on trip_review_decisions(trip_id, created_at asc);

create index if not exists trip_review_decisions_subject_idx
  on trip_review_decisions(trip_id, subject_type, subject_id);

create unique index if not exists trip_review_decisions_trip_key_idx
  on trip_review_decisions(trip_id, decision_key);

create index if not exists published_trip_snapshots_trip_id_idx
  on published_trip_snapshots(trip_id, version desc);

create unique index if not exists published_trip_snapshots_trip_version_idx
  on published_trip_snapshots(trip_id, version);

create index if not exists published_trip_private_details_snapshot_idx
  on published_trip_private_details(snapshot_id, subject_type, subject_id);

create unique index if not exists published_trip_private_details_snapshot_detail_idx
  on published_trip_private_details(snapshot_id, detail_id);

create index if not exists trip_payment_events_trip_id_idx
  on trip_payment_events(trip_id, received_at desc);

create unique index if not exists trip_payment_events_event_id_idx
  on trip_payment_events(event_id)
  where event_id is not null;

create unique index if not exists trip_payment_events_checkout_session_idx
  on trip_payment_events(checkout_session_id);

drop policy if exists "Trip owners can manage trips" on trips;
drop policy if exists "Trip owners can manage uploads" on trip_uploads;
drop policy if exists "Trip owners can manage legs" on trip_legs;
drop policy if exists "Trip owners can manage items" on trip_items;
drop policy if exists "Trip owners can manage build settings" on trip_build_settings;
drop policy if exists "Trip owners can manage style settings" on trip_style_settings;
drop policy if exists "Trip owners can manage processing runs" on trip_processing_runs;
drop policy if exists "Trip owners can manage draft snapshots" on trip_draft_snapshots;
drop policy if exists "Trip owners can manage material extractions" on trip_material_extractions;
drop policy if exists "Trip owners can read processing events" on trip_processing_events;
drop policy if exists "Trip owners can create processing events" on trip_processing_events;
drop policy if exists "Trip owners can manage review decisions" on trip_review_decisions;
drop policy if exists "Trip owners can manage published snapshots" on published_trip_snapshots;
drop policy if exists "Trip owners can manage published private details" on published_trip_private_details;
drop policy if exists "Trip owners can read payment events" on trip_payment_events;

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

create policy "Trip owners can read processing events"
  on trip_processing_events
  for select
  using (
    exists (
      select 1 from trips
      where trips.id = trip_processing_events.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can create processing events"
  on trip_processing_events
  for insert
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_processing_events.trip_id
        and trips.owner_user_id = auth.uid()
    )
    and (
      trip_processing_events.processing_run_id is null
      or exists (
        select 1 from trip_processing_runs
        where trip_processing_runs.id = trip_processing_events.processing_run_id
          and trip_processing_runs.trip_id = trip_processing_events.trip_id
      )
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

create policy "Trip owners can manage published private details"
  on published_trip_private_details
  for all
  using (
    exists (
      select 1 from trips
      where trips.id = published_trip_private_details.trip_id
        and trips.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = published_trip_private_details.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create policy "Trip owners can read payment events"
  on trip_payment_events
  for select
  using (
    exists (
      select 1 from trips
      where trips.id = trip_payment_events.trip_id
        and trips.owner_user_id = auth.uid()
    )
  );

create or replace function complete_trip_processing_run(
  p_trip_id uuid,
  p_run_id uuid,
  p_model text,
  p_draft_json jsonb,
  p_usage jsonb
)
returns table (
  id uuid,
  trip_id uuid,
  processing_run_id uuid,
  source text,
  draft_json jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_status text;
  v_snapshot_id uuid;
begin
  perform 1
  from trips
  where trips.id = p_trip_id
    and trips.status <> 'deleted'
    and (
      trips.owner_user_id = auth.uid()
      or auth.role() = 'service_role'
    )
  for update;

  if not found then
    raise exception 'Trip is missing, deleted, or not owned by the caller.'
      using errcode = 'P0002';
  end if;

  select status
  into v_run_status
  from trip_processing_runs
  where trip_processing_runs.id = p_run_id
    and trip_processing_runs.trip_id = p_trip_id
  for update;

  if not found then
    raise exception 'Processing run is missing for this trip.'
      using errcode = 'P0002';
  end if;

  if v_run_status not in ('pending', 'processing', 'completed') then
    raise exception 'Processing run cannot be completed from status %.', v_run_status
      using errcode = 'P0001';
  end if;

  select trip_draft_snapshots.id
  into v_snapshot_id
  from trip_draft_snapshots
  where trip_draft_snapshots.processing_run_id = p_run_id
    and trip_draft_snapshots.trip_id = p_trip_id
  order by trip_draft_snapshots.created_at desc
  limit 1;

  update trip_processing_runs
  set
    completed_at = now(),
    model = p_model,
    openai_usage = p_usage,
    status = 'completed'
  where trip_processing_runs.id = p_run_id
    and trip_processing_runs.trip_id = p_trip_id;

  if v_snapshot_id is null then
    insert into trip_draft_snapshots (
      draft_json,
      processing_run_id,
      source,
      trip_id
    )
    values (
      p_draft_json,
      p_run_id,
      'openai_initial_parse',
      p_trip_id
    )
    returning trip_draft_snapshots.id into v_snapshot_id;
  end if;

  update trips
  set
    processing_status = 'parsed',
    updated_at = now()
  where trips.id = p_trip_id;

  insert into trip_processing_events (
    trip_id,
    processing_run_id,
    stage,
    status,
    details
  )
  values (
    p_trip_id,
    p_run_id,
    'draft_snapshot',
    'completed',
    jsonb_build_object(
      'snapshotId', v_snapshot_id,
      'model', p_model
    )
  );

  return query
  select
    trip_draft_snapshots.id,
    trip_draft_snapshots.trip_id,
    trip_draft_snapshots.processing_run_id,
    trip_draft_snapshots.source,
    trip_draft_snapshots.draft_json,
    trip_draft_snapshots.created_at
  from trip_draft_snapshots
  where trip_draft_snapshots.id = v_snapshot_id;
end;
$$;

create or replace function fail_trip_processing_run(
  p_trip_id uuid,
  p_run_id uuid,
  p_error_message text,
  p_failure_details jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_status text;
begin
  perform 1
  from trips
  where trips.id = p_trip_id
    and trips.status <> 'deleted'
    and (
      trips.owner_user_id = auth.uid()
      or auth.role() = 'service_role'
    )
  for update;

  if not found then
    raise exception 'Trip is missing, deleted, or not owned by the caller.'
      using errcode = 'P0002';
  end if;

  select status
  into v_run_status
  from trip_processing_runs
  where trip_processing_runs.id = p_run_id
    and trip_processing_runs.trip_id = p_trip_id
  for update;

  if not found then
    raise exception 'Processing run is missing for this trip.'
      using errcode = 'P0002';
  end if;

  if v_run_status = 'completed' then
    insert into trip_processing_events (
      trip_id,
      processing_run_id,
      stage,
      status,
      details,
      error_message
    )
    values (
      p_trip_id,
      p_run_id,
      'run_failure',
      'skipped',
      jsonb_build_object('reason', 'run_already_completed'),
      left(coalesce(p_error_message, 'Trip extraction failed.'), 1000)
    );
    return;
  end if;

  update trip_processing_runs
  set
    completed_at = now(),
    error_message = left(coalesce(p_error_message, 'Trip extraction failed.'), 1000),
    openai_usage = p_failure_details,
    status = 'failed'
  where trip_processing_runs.id = p_run_id
    and trip_processing_runs.trip_id = p_trip_id;

  update trips
  set
    processing_status = 'failed',
    updated_at = now()
  where trips.id = p_trip_id;

  insert into trip_processing_events (
    trip_id,
    processing_run_id,
    stage,
    status,
    details,
    error_message
  )
  values (
    p_trip_id,
    p_run_id,
    'run',
    'failed',
    coalesce(p_failure_details, '{}'::jsonb),
    left(coalesce(p_error_message, 'Trip extraction failed.'), 1000)
  );
end;
$$;

create or replace function publish_trip_snapshot(
  p_trip_id uuid,
  p_created_by_user_id uuid,
  p_share_token text,
  p_snapshot_json jsonb,
  p_private_details jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  trip_id uuid,
  version integer,
  share_token text,
  snapshot_json jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_created_at timestamptz;
  v_version integer;
begin
  if auth.role() <> 'service_role' and p_created_by_user_id is distinct from auth.uid() then
    raise exception 'Published snapshot creator must match the signed-in maker.'
      using errcode = 'P0001';
  end if;

  perform 1
  from trips
  where trips.id = p_trip_id
    and trips.status <> 'deleted'
    and (
      trips.owner_user_id = p_created_by_user_id
      or auth.role() = 'service_role'
    )
  for update;

  if not found then
    raise exception 'Trip is missing, deleted, or not owned by the publisher.'
      using errcode = 'P0002';
  end if;

  select coalesce(max(published_trip_snapshots.version), 0) + 1
  into v_version
  from published_trip_snapshots
  where published_trip_snapshots.trip_id = p_trip_id;

  insert into published_trip_snapshots (
    created_by_user_id,
    share_token,
    snapshot_json,
    trip_id,
    version
  )
  values (
    p_created_by_user_id,
    p_share_token,
    p_snapshot_json,
    p_trip_id,
    v_version
  )
  returning
    published_trip_snapshots.id,
    published_trip_snapshots.created_at
  into v_snapshot_id, v_created_at;

  insert into published_trip_private_details (
    detail_id,
    label,
    reason,
    snapshot_id,
    subject_id,
    subject_type,
    trip_id,
    value,
    visibility
  )
  select
    detail.value ->> 'id',
    coalesce(nullif(detail.value ->> 'label', ''), 'Protected detail'),
    nullif(detail.value ->> 'reason', ''),
    v_snapshot_id,
    coalesce(nullif(detail.value ->> 'subjectId', ''), p_trip_id::text),
    coalesce(nullif(detail.value ->> 'subjectType', ''), 'trip'),
    p_trip_id,
    coalesce(detail.value ->> 'value', ''),
    coalesce(nullif(detail.value ->> 'visibility', ''), 'traveler_password')
  from jsonb_array_elements(coalesce(p_private_details, '[]'::jsonb)) as detail
  where detail.value ? 'id';

  update trips
  set
    processing_status = 'published',
    published_app_token = p_share_token,
    published_at = v_created_at,
    published_snapshot_id = v_snapshot_id,
    status = 'published',
    updated_at = v_created_at
  where trips.id = p_trip_id;

  insert into trip_processing_events (
    trip_id,
    processing_run_id,
    stage,
    status,
    details
  )
  values (
    p_trip_id,
    null,
    'publish',
    'completed',
    jsonb_build_object(
      'snapshotId', v_snapshot_id,
      'version', v_version
    )
  );

  return query
  select
    published_trip_snapshots.id,
    published_trip_snapshots.trip_id,
    published_trip_snapshots.version,
    published_trip_snapshots.share_token,
    published_trip_snapshots.snapshot_json,
    published_trip_snapshots.created_at
  from published_trip_snapshots
  where published_trip_snapshots.id = v_snapshot_id;
end;
$$;

revoke execute on function complete_trip_processing_run(uuid, uuid, text, jsonb, jsonb)
  from public;

revoke execute on function fail_trip_processing_run(uuid, uuid, text, jsonb)
  from public;

revoke execute on function publish_trip_snapshot(uuid, uuid, text, jsonb, jsonb)
  from public;

grant execute on function complete_trip_processing_run(uuid, uuid, text, jsonb, jsonb)
  to authenticated, service_role;

grant execute on function fail_trip_processing_run(uuid, uuid, text, jsonb)
  to authenticated, service_role;

grant execute on function publish_trip_snapshot(uuid, uuid, text, jsonb, jsonb)
  to authenticated, service_role;

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
