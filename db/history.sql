-- GIFT City Times — temporal history layer (append-only, fully additive).
--
-- WHY: the `entities` table is current-state only — every ingest overwrites
-- fields (status, address, contact person, validity...), destroying history.
-- This captures every DISTINCT state of each entity over time (SCD Type-2),
-- so the register can be reconstructed as-of any date and each entity's
-- field-level evolution is preserved. It never touches existing tables, so
-- it's safe to add and safe to drop.
--
-- Run once in the Supabase SQL editor (or via db apply).

create table if not exists entity_versions (
  id                   bigint generated always as identity primary key,
  entity_id            uuid not null references entities(id) on delete cascade,
  encrypted_id         text not null,               -- stable IFSCA id
  content_hash         text not null,               -- sha256 of the tracked fields
  -- promoted columns (fast filtering); full snapshot lives in `data`
  name                 text,
  category             text,
  subcategory          text,
  status               text,
  desk                 text,
  registration_number  text,
  date_of_registration date,
  validity_to          date,
  registered_address   text,
  contact_person       text,
  email                text,
  website              text,
  remarks              text,
  data                 jsonb not null,              -- full snapshot of tracked fields
  entity_first_seen    timestamptz,                 -- when the entity itself was first observed
  first_version        boolean not null default false,
  valid_from           timestamptz not null default now(),  -- when we first observed THIS state
  valid_to             timestamptz                  -- null = current/open version
);

create index if not exists entity_versions_entity    on entity_versions (entity_id, valid_from desc);
create index if not exists entity_versions_encrypted on entity_versions (encrypted_id, valid_from desc);
create index if not exists entity_versions_open      on entity_versions (entity_id) where valid_to is null;
create index if not exists entity_versions_asof      on entity_versions (valid_from, valid_to);
create index if not exists entity_versions_status    on entity_versions (status);

-- Only the service_role (server/ingest) may read history; anon gets nothing.
alter table entity_versions enable row level security;

-- The register exactly as it stood at `as_of` (transaction time):
--   select * from entities_asof('2026-01-01'::timestamptz);
create or replace function entities_asof(as_of timestamptz)
returns setof entity_versions
language sql
stable
as $$
  select *
  from entity_versions
  where valid_from <= as_of
    and (valid_to is null or valid_to > as_of);
$$;

-- Convenience: the current open version per entity.
create or replace view entity_current_version as
  select * from entity_versions where valid_to is null;
