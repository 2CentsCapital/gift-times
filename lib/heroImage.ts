// Lead-story hero image, chosen fresh each day and matched to the news.
//
// Primary source: Unsplash (editorial-grade, free to use with attribution).
// Requires UNSPLASH_ACCESS_KEY (server-side only). Falls back to Openverse
// (keyless, CC-commercial) if the key is absent or a query returns nothing.
// The pick rotates by day-of-year so the same desk doesn't repeat day to day,
// and we always keep attribution for the caption.

export type Hero = {
  url: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  license: string;
  source: "Unsplash" | "Openverse";
  sourceUrl: string | null;
} | null;

// Desk / category → a set of editorial searches with an India-financial flavour.
function queriesFor(desk?: string | null, category?: string | null): string[] {
  const key = (category || desk || "").toLowerCase();
  if (/jewel|bullion|metal|gold|commodit/.test(key))
    return ["gold bullion bars", "gold jewellery india", "precious metals vault"];
  if (/fund|aif|asset manage/.test(key))
    return ["stock market data screen", "financial charts trading", "investment finance"];
  if (/broker|capital market|intermediar/.test(key))
    return ["stock exchange building", "financial district trading", "wall street"];
  if (/bank|finance company|payment/.test(key))
    return ["bank skyscraper", "financial district skyline dusk", "corporate headquarters tower"];
  if (/insur/.test(key)) return ["modern office towers", "corporate glass building", "business district"];
  if (/fintech|sandbox|innovation/.test(key))
    return ["fintech technology", "data center servers technology", "abstract network technology"];
  if (/regulat|circular|consult|notif|law/.test(key))
    return ["government finance building", "courthouse columns architecture", "official document desk"];
  if (/sez|uac|approval|tender/.test(key))
    return ["skyscraper construction", "cranes construction site city", "architecture blueprint"];
  // Default: GIFT-City / Indian financial-hub feel.
  return ["financial district skyline dusk", "mumbai business district", "modern city skyline towers"];
}

function dayOfYear(d = new Date()): number {
  return Math.floor((Date.now() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

async function unsplashSearch(q: string, key: string): Promise<any[]> {
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}` +
        `&orientation=landscape&content_filter=high&per_page=20`,
      {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
        next: { revalidate: 21600 }, // refresh a few times a day
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!r.ok) return [];
    const j = await r.json();
    return j?.results || [];
  } catch {
    return [];
  }
}

async function fromUnsplash(queries: string[]): Promise<Hero> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  // Try the queries in a day-rotated order until one actually returns photos —
  // so a niche term that comes back empty never leaves the page with no image.
  const start = dayOfYear() % queries.length;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[(start + i) % queries.length];
    const results = await unsplashSearch(q, key);
    if (results.length === 0) continue;
    const pick = results[dayOfYear() % results.length];
    if (!pick?.urls?.raw) continue;
    const url = `${pick.urls.raw}&w=1400&h=900&fit=crop&crop=entropy&q=80&fm=jpg`;
    return {
      url,
      title: pick.alt_description || pick.description || q,
      creator: pick.user?.name || null,
      creatorUrl: pick.user?.links?.html ? `${pick.user.links.html}?utm_source=gift_city_times&utm_medium=referral` : null,
      license: "Unsplash",
      source: "Unsplash",
      sourceUrl: pick.links?.html || null,
    };
  }
  return null;
}

async function fromOpenverse(queries: string[]): Promise<Hero> {
  const q = queries[dayOfYear() % queries.length];
  try {
    const r = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}` +
        `&license_type=commercial&size=large&aspect_ratio=wide&mature=false&page_size=20`,
      { headers: { "User-Agent": "giftcitytimes-hero" }, next: { revalidate: 21600 }, signal: AbortSignal.timeout(7000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const results: any[] = (j?.results || []).filter((x: any) => x?.url);
    if (results.length === 0) return null;
    const pick = results[dayOfYear() % results.length];
    const lic = (pick.license || "").toUpperCase();
    return {
      url: pick.url,
      title: pick.title || q,
      creator: pick.creator || null,
      creatorUrl: pick.creator_url || null,
      license: lic === "CC0" ? "CC0" : `CC ${lic}${pick.license_version ? " " + pick.license_version : ""}`,
      source: "Openverse",
      sourceUrl: pick.foreign_landing_url || null,
    };
  } catch {
    return null;
  }
}

export async function getHeroImage(desk?: string | null, category?: string | null): Promise<Hero> {
  const queries = queriesFor(desk, category);
  return (await fromUnsplash(queries)) || (await fromOpenverse(queries));
}
