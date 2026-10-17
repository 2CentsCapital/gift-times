import { getTicker, type Ticker } from "@/lib/ticker";

// Live market data for the masthead ticker. The client polls this every 60s so
// the numbers stay current regardless of the page's ISR cache. We never rely on
// Next's data cache here (it can go stale on self-hosted) — instead we keep a
// tiny in-process cache so Yahoo is hit at most once a minute across all readers
// (Coolify runs a long-lived Node server, so module state persists).
export const dynamic = "force-dynamic";

let cache: { data: Ticker; at: number } | null = null;
const TTL = 60_000;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    cache = { data: await getTicker(true), at: Date.now() };
  }
  return Response.json(cache.data, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
}
