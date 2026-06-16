create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  name text not null,
  slug text,
  status text not null default 'draft',
  payment_status text not null default 'unpaid',
  processing_status text not null default 'not_started',
  start_date date,
  end_date date,
  destination_summary text,
  color_palette text,
  cover_image_url text,
  published_app_token text unique,
  published_at timestamptz,
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

