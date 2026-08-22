-- Space/punctuation-insensitive search: "stock holding" == "stockholding".
-- Re-creates search_all to normalise both the query and the target fields.
-- Idempotent (create or replace). Also kept in db/schema.sql.

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
  with n as (select regexp_replace(lower(coalesce(q,'')), '[^a-z0-9]', '', 'g') as nq)
  select 'entity'::text, e.id, e.name,
         coalesce(e.category,'') ||
           case when e.subcategory is not null then ' · ' || e.subcategory else '' end,
         e.desk,
         nullif(e.contact_person,''),
         e.date_of_registration
  from entities e, n
  where n.nq <> '' and (
        regexp_replace(lower(e.name), '[^a-z0-9]', '', 'g') like '%'||n.nq||'%'
     or regexp_replace(lower(coalesce(e.contact_person,'')), '[^a-z0-9]', '', 'g') like '%'||n.nq||'%')

  union all

  select 'person'::text, p.entity_id, p.name,
         e.name, e.desk, e.category, e.date_of_registration
  from people p join entities e on e.id = p.entity_id, n
  where n.nq <> '' and regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g') like '%'||n.nq||'%'

  union all

  select 'publication'::text, pub.id, pub.title,
         initcap(pub.kind), pub.desk, null, pub.publish_date
  from publications pub, n
  where n.nq <> '' and regexp_replace(lower(pub.title), '[^a-z0-9]', '', 'g') like '%'||n.nq||'%'

  union all

  select 'sez'::text, s.id, s.title,
         'SEZ / UAC Approval', s.desk, null, s.meeting_date
  from sez_meetings s, n
  where n.nq <> '' and regexp_replace(lower(s.title), '[^a-z0-9]', '', 'g') like '%'||n.nq||'%'

  order by 7 desc nulls last
  limit 100;
$$;
