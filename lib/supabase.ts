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
