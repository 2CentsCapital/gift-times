import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

// Server-side clients using the service_role key (stays on the server — App
// Router server components / route handlers). Never import from a "use client"
// component.
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// Optional: SUPABASE_PIN_IP makes every connection to the Supabase host go to
// that IP instead of what DNS says. The hosting box sits behind a NAT that
// cannot hairpin to its own public IP, so a self-hosted Supabase on the same
// box is reached through the local reverse proxy (e.g. 10.0.1.1). TLS still
// verifies the real hostname (SNI is unchanged), so the certificate must match.
const pinIp = process.env.SUPABASE_PIN_IP || "";

function requireEnv() {
  if (!url || !key) {
    throw new Error("Supabase env not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
}

let pinnedFetch: typeof fetch | undefined;

function getPinnedFetch(): typeof fetch | undefined {
  if (!pinIp) return undefined;
  if (pinnedFetch) return pinnedFetch;
  const pinnedHost = new URL(url).hostname;
  const family = pinIp.includes(":") ? 6 : 4;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookup = (hostname: string, options: any, callback: any) => {
    if (hostname !== pinnedHost) return dns.lookup(hostname, options, callback);
    if (options && typeof options === "object" && options.all) {
      return callback(null, [{ address: pinIp, family }]);
    }
    return callback(null, pinIp, family);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = new Agent({ connect: { lookup: lookup as any } });
  pinnedFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undiciFetch(input as any, { ...(init as any), dispatcher: agent })) as unknown as typeof fetch;
  return pinnedFetch;
}

// Cacheable client for pages. Pages set `revalidate`, so the Data Cache is
// bounded (data refreshes on that interval — no indefinite staleness).
export function getSupabase() {
  requireEnv();
  const pinned = getPinnedFetch();
  return createClient(url, key, {
    auth: { persistSession: false },
    ...(pinned ? { global: { fetch: pinned } } : {}),
  });
}

// Fresh client for route handlers (mirror, subscribe, confirm, unsubscribe)
// that must read live state — never served from Next's Data Cache.
export function getSupabaseFresh() {
  requireEnv();
  const pinned = getPinnedFetch();
  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        (pinned ?? fetch)(input, { ...init, cache: "no-store" }),
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
