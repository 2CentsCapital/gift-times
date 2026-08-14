import { cache } from "react";
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

export type SezMeeting = {
  id: string;
  title: string;
  meeting_date: string | null;
  status: string | null;
  notice_url: string | null;
  agenda_url: string | null;
  approval_url: string | null;
  minutes_url: string | null;
};

const ENTITY_DESKS = ["Brokers", "FMEs", "Insurance", "Fintech", "Banking"];

export async function getSezMeetings(limit = 200): Promise<SezMeeting[]> {
  const supa = getSupabase();
  const { data } = await supa
    .from("sez_meetings")
    .select("*")
    .order("meeting_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data as SezMeeting[]) || [];
}

// Full, honest category breakdown of active entities (sums to total).
export async function getCategoryCounts(): Promise<{
  items: { category: string; count: number }[];
  total: number;
}> {
  const supa = getSupabase();
  const counts: Record<string, number> = {};
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await supa
      .from("entities")
      .select("category")
      .eq("status", "Active")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const c = (e as any).category || "Other";
      counts[c] = (counts[c] || 0) + 1;
      total++;
    }
    if (data.length < 1000) break;
  }
  const items = Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  return { items, total };
}

export async function getCounts() {
  const supa = getSupabase();
  const desks = ["Brokers", "FMEs", "Insurance", "Fintech", "Banking"];
  const counts: Record<string, number> = {};
  // Accurate counts via head:true (PostgREST caps returned rows at 1000).
  const [{ count: total }, ...deskCounts] = await Promise.all([
    supa.from("entities").select("*", { count: "exact", head: true }).eq("status", "Active"),
    ...desks.map((d) =>
      supa
        .from("entities")
        .select("*", { count: "exact", head: true })
        .eq("status", "Active")
        .eq("desk", d)
    ),
  ]);
  desks.forEach((d, i) => (counts[d] = deskCounts[i].count || 0));
  return { counts, total: total || 0 };
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

// cache() dedupes the fetch between generateMetadata and the page render.
export const getEntity = cache(
  async (id: string): Promise<{ entity: Entity | null; people: any[] }> => {
    const supa = getSupabase();
    const { data: entity } = await supa.from("entities").select("*").eq("id", id).maybeSingle();
    if (!entity) return { entity: null, people: [] };
    const { data: people } = await supa.from("people").select("*").eq("entity_id", id);
    return { entity: entity as Entity, people: people || [] };
  }
);

export async function searchAll(q: string) {
  const supa = getSupabase();
  // Cap length (DoS) — the term is parameterized to the RPC either way.
  const term = (q || "").slice(0, 80);
  const { data, error } = await supa.rpc("search_all", { q: term });
  if (error) {
    // Fallback (only if the RPC is missing). Strip PostgREST filter
    // metacharacters so `q` can't inject extra .or() conditions.
    const safe = term.replace(/[,()*"\\]/g, " ").trim();
    const { data: ents } = await supa
      .from("entities")
      .select("id,name,category,subcategory,desk,contact_person,date_of_registration")
      .or(`name.ilike.%${safe}%,contact_person.ilike.%${safe}%`)
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
