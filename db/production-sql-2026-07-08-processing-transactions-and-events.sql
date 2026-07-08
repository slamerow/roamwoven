-- Additive durability patch for transactional extraction/publish commits
-- and queryable processing-stage events.
-- Run in Supabase SQL editor before deploying the matching application code.

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

alter table trip_processing_events enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert on trip_processing_events to authenticated;
grant select, insert, update, delete on trip_processing_events to service_role;

create index if not exists trip_processing_events_trip_created_idx
  on trip_processing_events(trip_id, created_at desc);

create index if not exists trip_processing_events_run_created_idx
  on trip_processing_events(processing_run_id, created_at desc)
  where processing_run_id is not null;

drop policy if exists "Trip owners can read processing events" on trip_processing_events;
drop policy if exists "Trip owners can create processing events" on trip_processing_events;

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
