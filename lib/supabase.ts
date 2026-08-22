import { createClient } from "@supabase/supabase-js";

// Server-side clients using the service_role key (stays on the server — App
// Router server components / route handlers). Never import from a "use client"
// component.
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function requireEnv() {
  if (!url || !key) {
    throw new Error("Supabase env not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
}

// Cacheable client for pages. Pages set `revalidate`, so the Data Cache is
// bounded (data refreshes on that interval — no indefinite staleness).
export function getSupabase() {
  requireEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}

// Fresh client for route handlers (mirror, subscribe, confirm, unsubscribe)
// that must read live state — never served from Next's Data Cache.
export function getSupabaseFresh() {
  requireEnv();
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

// PostgREST caps a response at 1000 rows, so anything that needs the whole
// table has to page through it.
export async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const supa = getSupabase();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}
