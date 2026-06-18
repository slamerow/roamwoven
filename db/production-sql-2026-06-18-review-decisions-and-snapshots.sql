-- Additive production patch for review decisions and published traveler snapshots.
-- Run in Supabase SQL editor before testing deployed review-decision writes
-- or publish snapshot creation.

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

alter table trip_review_decisions enable row level security;
alter table published_trip_snapshots enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on trip_review_decisions to anon;
grant select, insert, update, delete on trip_review_decisions to authenticated;
grant select, insert, update, delete on trip_review_decisions to service_role;
grant select, insert, update, delete on published_trip_snapshots to anon;
grant select, insert, update, delete on published_trip_snapshots to authenticated;
grant select, insert, update, delete on published_trip_snapshots to service_role;

create index if not exists trip_review_decisions_trip_id_idx
  on trip_review_decisions(trip_id, created_at asc);

create index if not exists trip_review_decisions_subject_idx
  on trip_review_decisions(trip_id, subject_type, subject_id);

create index if not exists published_trip_snapshots_trip_id_idx
  on published_trip_snapshots(trip_id, version desc);

create unique index if not exists published_trip_snapshots_trip_version_idx
  on published_trip_snapshots(trip_id, version);

drop policy if exists "Trip owners can manage review decisions" on trip_review_decisions;
drop policy if exists "Trip owners can manage published snapshots" on published_trip_snapshots;

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
