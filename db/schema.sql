-- The GIFT Times — Supabase / Postgres schema
-- Run this once in the Supabase SQL editor (or via psql).

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Regulated entities (brokers, FMEs, insurers, fintechs, banks, ...)
-- ---------------------------------------------------------------------------
create table if not exists entities (
  id                   uuid primary key default gen_random_uuid(),
  encrypted_id         text unique not null,          -- IFSCA EncryptedId
  df_id                bigint,
  name                 text not null,
  category             text,                           -- IFSCA parent category
  subcategory          text,
  registration_number  text,
  date_of_registration date,
  validity_to          date,
  registered_address   text,
  contact_person       text,
  email                text,
  website              text,
  remarks              text,
  is_active            boolean default true,
  status               text default 'Active',          -- Active / Surrendered / Cancelled
  desk                 text,                            -- newspaper desk (see ingest)
  ifsca_modified_on    timestamptz,
  first_seen           timestamptz default now(),
  last_seen            timestamptz default now(),
  detail_fetched_at    timestamptz
);
create index if not exists entities_name_trgm  on entities using gin (name gin_trgm_ops);
create index if not exists entities_contact_trgm on entities using gin (contact_person gin_trgm_ops);
create index if not exists entities_category    on entities (category);
create index if not exists entities_desk        on entities (desk);
create index if not exists entities_regdate     on entities (date_of_registration desc nulls last);

-- ---------------------------------------------------------------------------
-- Authorised / contact persons (one or more per entity)
-- ---------------------------------------------------------------------------
create table if not exists people (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references entities(id) on delete cascade,
  name        text not null,
  email       text,
  role        text default 'Contact Person',
  first_seen  timestamptz default now(),
  unique (entity_id, name)
);
create index if not exists people_name_trgm on people using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Publications: circulars, regulations, notifications, rules, guidelines,
-- AML/CFT/KYC, news / press releases, consultation papers
-- ---------------------------------------------------------------------------
create table if not exists publications (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,     -- circular/regulation/notification/rules/guidelines/aml/news/consultation
  ifsca_id     bigint,
  title        text not null,
  publish_date date,
  file_url     text,
  desk         text,
  first_seen   timestamptz default now(),
  unique (kind, ifsca_id)
);
create index if not exists publications_title_trgm on publications using gin (title gin_trgm_ops);
create index if not exists publications_kind_date  on publications (kind, publish_date desc nulls last);
create index if not exists publications_date       on publications (publish_date desc nulls last);

-- ---------------------------------------------------------------------------
-- Change log — the newspaper / newsletter feed
-- ---------------------------------------------------------------------------
create table if not exists changes (
  id           uuid primary key default gen_random_uuid(),
  occurred_on  date not null default current_date,
  change_type  text not null,     -- entity_added / entity_removed / entity_status_change / publication_added
  desk         text,              -- Brokers / FMEs / Insurance / Fintech / Banking / Circulars / Regulations / News / Consultations / Other
  headline     text not null,
  category     text,
  ref_table    text,
  ref_id       uuid,
  url          text,
  detail       jsonb,
  created_at   timestamptz default now()
);
create index if not exists changes_occurred on changes (occurred_on desc);
create index if not exists changes_desk      on changes (desk);

-- ---------------------------------------------------------------------------
-- Newsletter subscribers (public sign-up, phase 2)
-- ---------------------------------------------------------------------------
create table if not exists subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  confirmed       boolean default false,
  created_at      timestamptz default now(),
  unsubscribed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Operational logs
-- ---------------------------------------------------------------------------
create table if not exists ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text,              -- full / daily
  started_at  timestamptz default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb
);

create table if not exists newsletter_sends (
  id              uuid primary key default gen_random_uuid(),
  send_date       date,
  sent_at         timestamptz default now(),
  recipient_count int,
  change_count    int
);
-- Allow multiple sends per day (morning + evening editions): drop the old
-- once-per-day unique lock if a previous schema created it.
alter table newsletter_sends drop constraint if exists newsletter_sends_send_date_key;

-- Subscribe rate-limiting (per IP).
create table if not exists signup_attempts (
  id         uuid primary key default gen_random_uuid(),
  ip         text,
  created_at timestamptz default now()
);
create index if not exists signup_attempts_ip_time on signup_attempts (ip, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: public read for the site's content; writes stay on the
-- service_role key (which bypasses RLS). Subscribers are NOT publicly readable.
-- ---------------------------------------------------------------------------
alter table entities     enable row level security;
alter table people       enable row level security;
alter table publications enable row level security;
alter table changes      enable row level security;

-- Private tables: enable RLS with NO anon policies so the public/anon role is
-- fully denied. The service_role key (used by the API + scripts) bypasses RLS,
-- so subscribe/ingest/newsletter keep working. This protects subscriber PII
-- and internal operational logs from the public anon key.
alter table subscribers      enable row level security;
alter table ingest_runs      enable row level security;
alter table newsletter_sends enable row level security;
alter table signup_attempts  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='entities' and policyname='public_read') then
    create policy public_read on entities     for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='people' and policyname='public_read') then
    create policy public_read on people        for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='publications' and policyname='public_read') then
    create policy public_read on publications  for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='changes' and policyname='public_read') then
    create policy public_read on changes       for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SEZ / UAC (Unit Approval Committee) meetings — notices, agendas, approvals
-- and minutes. Signals who is coming to GIFT and who got set-up approval.
-- ---------------------------------------------------------------------------
create table if not exists sez_meetings (
  id            uuid primary key default gen_random_uuid(),
  ifsca_id      bigint unique,
  title         text not null,
  meeting_date  date,
  category_type text default 'UACMeeting',
  notice_url    text,
  agenda_url    text,
  approval_url  text,
  minutes_url   text,
  status        text,                    -- Scheduled / Held / Minutes Out
  desk          text default 'SEZ Approvals',
  first_seen    timestamptz default now(),
  updated_at    timestamptz default now()
);
-- add column for pre-existing installs (create table if-not-exists won't)
alter table sez_meetings add column if not exists status text;
create index if not exists sez_meetings_date  on sez_meetings (meeting_date desc nulls last);
create index if not exists sez_meetings_title on sez_meetings using gin (title gin_trgm_ops);

alter table sez_meetings enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='sez_meetings' and policyname='public_read') then
    create policy public_read on sez_meetings for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Universal search: entities (by name OR contact person) + publications + SEZ.
-- Returns a unified result set for the site's search box.
-- ---------------------------------------------------------------------------
create or replace function search_all(q text)
returns table (
  result_type text,
  id          uuid,
  title       text,
  subtitle    text,
  desk        text,
  extra       text,
  the_date    date
)
language sql stable
as $$
  select 'entity'::text, e.id, e.name,
         coalesce(e.category,'') ||
           case when e.subcategory is not null then ' · ' || e.subcategory else '' end,
         e.desk,
         nullif(e.contact_person,''),
         e.date_of_registration
  from entities e
  where e.name ilike '%'||q||'%' or e.contact_person ilike '%'||q||'%'

  union all

  select 'person'::text, p.entity_id, p.name,
         e.name, e.desk, e.category, e.date_of_registration
  from people p join entities e on e.id = p.entity_id
  where p.name ilike '%'||q||'%'

  union all

  select 'publication'::text, pub.id, pub.title,
         initcap(pub.kind), pub.desk, null, pub.publish_date
  from publications pub
  where pub.title ilike '%'||q||'%'

  union all

  select 'sez'::text, s.id, s.title,
         'SEZ / UAC Approval', s.desk, null, s.meeting_date
  from sez_meetings s
  where s.title ilike '%'||q||'%'

  order by 7 desc nulls last
  limit 100;
$$;
