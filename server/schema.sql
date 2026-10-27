-- Accounts. Password hashes live only here and are never sent to the browser.
create table if not exists users (
  id text primary key,
  username text not null,
  password_hash text not null,
  role text not null check (role in ('superadmin', 'admin', 'bursar', 'teacher', 'parent')),
  name text not null,
  staff_id text,
  guardian_id text,
  active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists users_username_ci on users (lower(username));

-- School records (students, payments, payroll runs, …), one row per record, grouped by collection.
create table if not exists records (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (collection, id)
);
create index if not exists records_by_collection on records (collection);

-- Single documents: the school profile and system settings.
create table if not exists kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Sequential numbers (registration, receipts, sales…) handed out atomically.
create table if not exists counters (
  name text primary key,
  value integer not null default 0
);
