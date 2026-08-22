// GIFT City Times — temporal history engine (SCD Type-2).
//
// Records every DISTINCT state of each entity over time into `entity_versions`,
// so the register is reconstructable as-of any date and every field change is
// preserved. This runs as a single reconciliation pass AFTER all entity
// mutations in an ingest — so it captures *every* field change (address,
// contact, validity, name, status, category...), regardless of which code path
// changed it, not just the transitions the change-log happens to detect.

import crypto from "crypto";

// Fields whose change constitutes a new version. Order-independent (we hash a
// canonical object), but kept explicit so a new column is a deliberate choice.
export const TRACKED = [
  "name",
  "category",
  "subcategory",
  "registration_number",
  "date_of_registration",
  "validity_to",
  "registered_address",
  "contact_person",
  "email",
  "website",
  "remarks",
  "status",
  "desk",
  "is_active",
];

// Deterministic content hash of the tracked fields (nulls normalised).
export function hashOf(entity) {
  const canon = {};
  for (const k of TRACKED) canon[k] = entity[k] ?? null;
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

function buildVersionRow(entity, hash, nowIso, isFirst) {
  const data = {};
  for (const k of TRACKED) data[k] = entity[k] ?? null;
  return {
    entity_id: entity.id,
    encrypted_id: entity.encrypted_id,
    content_hash: hash,
    name: entity.name ?? null,
    category: entity.category ?? null,
    subcategory: entity.subcategory ?? null,
    status: entity.status ?? null,
    desk: entity.desk ?? null,
    registration_number: entity.registration_number ?? null,
    date_of_registration: entity.date_of_registration ?? null,
    validity_to: entity.validity_to ?? null,
    registered_address: entity.registered_address ?? null,
    contact_person: entity.contact_person ?? null,
    email: entity.email ?? null,
    website: entity.website ?? null,
    remarks: entity.remarks ?? null,
    data,
    entity_first_seen: entity.first_seen ?? null,
    first_version: isFirst,
    valid_from: nowIso,
    valid_to: null,
  };
}

// Pure planner (unit-testable): given current entities and the currently-open
// version per entity (Map entity_id -> { id, content_hash }), decide which open
// versions to close and which new versions to insert.
export function computeVersionPlan(entities, openByEntity, nowIso) {
  const toInsert = [];
  const toCloseIds = [];
  for (const e of entities) {
    const hash = hashOf(e);
    const open = openByEntity.get(e.id);
    if (open && open.content_hash === hash) continue; // unchanged — no new version
    if (open) toCloseIds.push(open.id); // supersede the old version
    toInsert.push(buildVersionRow(e, hash, nowIso, !open));
  }
  return { toInsert, toCloseIds };
}

const PAGE = 1000;

async function loadAllEntities(supa) {
  const rows = [];
  const cols = ["id", "encrypted_id", "first_seen", ...TRACKED].join(", ");
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa.from("entities").select(cols).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function loadOpenVersions(supa) {
  const map = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from("entity_versions")
      .select("id, entity_id, content_hash")
      .is("valid_to", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const v of data) map.set(v.entity_id, v);
    if (data.length < PAGE) break;
  }
  return map;
}

// Run the reconciliation. Returns a summary; throws on DB error (caller wraps
// this so a history failure can never abort the core ingest).
export async function snapshotEntityVersions(supa) {
  const nowIso = new Date().toISOString();
  const entities = await loadAllEntities(supa);
  const openByEntity = await loadOpenVersions(supa);
  const { toInsert, toCloseIds } = computeVersionPlan(entities, openByEntity, nowIso);

  // Close superseded versions first (a brief gap is safer than an overlap).
  for (let i = 0; i < toCloseIds.length; i += 500) {
    const { error } = await supa
      .from("entity_versions")
      .update({ valid_to: nowIso })
      .in("id", toCloseIds.slice(i, i + 500));
    if (error) throw error;
  }
  // Insert the new open versions.
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supa.from("entity_versions").insert(toInsert.slice(i, i + 500));
    if (error) throw error;
  }

  return {
    entities: entities.length,
    versionsWritten: toInsert.length,
    firstVersions: toInsert.filter((v) => v.first_version).length,
    superseded: toCloseIds.length,
  };
}
