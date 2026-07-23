import { getSupabase } from "./supabase";

export type Change = {
  id: string;
  occurred_on: string;
  change_type: string;
  desk: string;
  headline: string;
  category: string | null;
  url: string | null;
  detail: any;
};

export type Entity = {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  desk: string | null;
  registration_number: string | null;
  date_of_registration: string | null;
  validity_to: string | null;
  registered_address: string | null;
  contact_person: string | null;
  email: string | null;
  website: string | null;
  remarks: string | null;
  status: string | null;
};

export type Publication = {
  id: string;
  kind: string;
  title: string;
  publish_date: string | null;
  file_url: string | null;
  desk: string | null;
};

const ENTITY_DESKS = ["Brokers", "FMEs", "Insurance", "Fintech", "Banking"];

export async function getCounts() {
  const supa = getSupabase();
  const { data } = await supa.from("entities").select("desk").eq("status", "Active");
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of data || []) {
    counts[r.desk || "Other"] = (counts[r.desk || "Other"] || 0) + 1;
    total++;
  }
  return { counts, total };
}

export async function getDeskEntities(desk: string, limit = 6): Promise<Entity[]> {
  const supa = getSupabase();
  const { data } = await supa
    .from("entities")
    .select("*")
    .eq("desk", desk)
    .eq("status", "Active")
    .order("date_of_registration", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as Entity[]) || [];
}

export async function getDeskPublications(desk: string, limit = 6): Promise<Publication[]> {
  const supa = getSupabase();
  const { data } = await supa
    .from("publications")
    .select("*")
    .eq("desk", desk)
    .order("publish_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as Publication[]) || [];
}

export async function getPublicationsByKind(kind: string, limit = 50): Promise<Publication[]> {
  const supa = getSupabase();
  const { data } = await supa
    .from("publications")
    .select("*")
    .eq("kind", kind)
    .order("publish_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as Publication[]) || [];
}

export async function getEntitiesByDesk(desk: string, limit = 100): Promise<Entity[]> {
  const supa = getSupabase();
  const { data } = await supa
    .from("entities")
    .select("*")
    .eq("desk", desk)
    .order("date_of_registration", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as Entity[]) || [];
}

export async function getRecentChanges(limit = 12): Promise<Change[]> {
  const supa = getSupabase();
  const { data } = await supa
    .from("changes")
    .select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Change[]) || [];
}

export async function getEntity(id: string): Promise<{ entity: Entity | null; people: any[] }> {
  const supa = getSupabase();
  const { data: entity } = await supa.from("entities").select("*").eq("id", id).maybeSingle();
  const { data: people } = await supa.from("people").select("*").eq("entity_id", id);
  return { entity: (entity as Entity) || null, people: people || [] };
}

export async function searchAll(q: string) {
  const supa = getSupabase();
  const { data, error } = await supa.rpc("search_all", { q });
  if (error) {
    // fallback: simple entity name search if the RPC isn't present
    const { data: ents } = await supa
      .from("entities")
      .select("id,name,category,subcategory,desk,contact_person,date_of_registration")
      .or(`name.ilike.%${q}%,contact_person.ilike.%${q}%`)
      .limit(50);
    return (ents || []).map((e: any) => ({
      result_type: "entity",
      id: e.id,
      title: e.name,
      subtitle: [e.category, e.subcategory].filter(Boolean).join(" · "),
      desk: e.desk,
      extra: e.contact_person,
      the_date: e.date_of_registration,
    }));
  }
  return data || [];
}

export function isEntityDesk(desk: string) {
  return ENTITY_DESKS.includes(desk);
}
