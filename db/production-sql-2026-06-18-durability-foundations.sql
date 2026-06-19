-- Additive durability patch for payment audit, idempotent review decisions,
-- active snapshot semantics, and soft-delete recovery metadata.
-- Run in Supabase SQL editor before deploying the matching application code.

alter table if exists trips
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists deletion_reason text;

alter table if exists trip_review_decisions
  add column if not exists decision_key text,
  add column if not exists updated_at timestamptz not null default now();

update trip_review_decisions
set decision_key = concat(trip_id::text, ':', subject_type, ':', subject_id, ':', action)
where decision_key is null;

alter table if exists trip_review_decisions
  alter column decision_key set not null;

create unique index if not exists trip_review_decisions_trip_key_idx
  on trip_review_decisions(trip_id, decision_key);

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

alter table trip_payment_events enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on trip_payment_events to anon;
grant select on trip_payment_events to authenticated;
grant select, insert, update, delete on trip_payment_events to service_role;

create index if not exists trip_payment_events_trip_id_idx
  on trip_payment_events(trip_id, received_at desc);

create unique index if not exists trip_payment_events_event_id_idx
  on trip_payment_events(event_id)
  where event_id is not null;

create unique index if not exists trip_payment_events_checkout_session_idx
  on trip_payment_events(checkout_session_id);

drop policy if exists "Trip owners can read payment events" on trip_payment_events;

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
