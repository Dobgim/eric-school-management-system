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

-- Self sign-up (added later). Every statement is safe to run again.
alter table users add column if not exists status text not null default 'active';
alter table users add column if not exists phone text;
alter table users add column if not exists email text;
alter table users add column if not exists requested_role text;
alter table users add column if not exists signup jsonb;
alter table users add column if not exists review_note text;
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('superadmin', 'admin', 'bursar', 'teacher', 'staff', 'parent'));
alter table users drop constraint if exists users_status_check;
alter table users add constraint users_status_check check (status in ('active', 'pending', 'rejected'));

-- Phone notifications (Web Push): one row per browser/phone that allowed notifications.
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on push_subscriptions (user_id);

-- Server-only secrets (payment provider keys, push keys). Values are encrypted and never sent to the browser.
create table if not exists secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Language for phone notifications and SMS ('en' or 'fr').
alter table users add column if not exists lang text not null default 'en';
