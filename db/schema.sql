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
  storage_path text,
  user_note text,
  detected_document_type text,
  classification_confidence numeric,
  processing_status text not null default 'pending',
  created_at timestamptz not null default now()
);

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

alter table trips enable row level security;
alter table trip_uploads enable row level security;
alter table trip_legs enable row level security;
alter table trip_items enable row level security;

create index if not exists trips_owner_user_id_idx
  on trips(owner_user_id);

create index if not exists trips_owner_status_idx
  on trips(owner_user_id, status);

create index if not exists trip_uploads_trip_id_idx
  on trip_uploads(trip_id);

create index if not exists trip_legs_trip_id_idx
  on trip_legs(trip_id);

create index if not exists trip_items_trip_id_idx
  on trip_items(trip_id);

create index if not exists trip_items_trip_date_idx
  on trip_items(trip_id, date);

drop policy if exists "Trip owners can manage trips" on trips;
drop policy if exists "Trip owners can manage uploads" on trip_uploads;
drop policy if exists "Trip owners can manage legs" on trip_legs;
drop policy if exists "Trip owners can manage items" on trip_items;

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
