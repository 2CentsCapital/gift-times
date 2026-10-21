// Lead-story hero image, chosen fresh each day and matched to the news.
//
// Reliability first: a curated set of images is BUNDLED in the repo
// (public/heroes/), so a hero always renders and we never show a broken hotlink.
// If UNSPLASH_ACCESS_KEY is set (e.g. in production) we prefer a fresh Unsplash
// pick — its CDN is reliable — and fall back to the bundled image otherwise or
// on any failure. The bundled set rotates by day-of-year for variety.

import heroCredits from "./heroCredits.json";

export type Hero = {
  url: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  license: string;
  source: "Unsplash" | "Openverse";
  sourceUrl: string | null;
} | null;

type Credit = { file: string; creator: string | null; creatorUrl: string | null; link: string | null; alt: string | null };
const CREDITS = heroCredits as Record<string, Credit[]>;

// Images are chosen by what the story IS (its theme), not a loose keyword, so a
// "new registrations" lead never gets a market chart. Each theme has a few
// queries (niche-first, reliable fallbacks) used only for the live Unsplash path.
const THEME_QUERIES: Record<string, string[]> = {
  newfirms: ["gift city gandhinagar", "financial district skyline dusk", "modern glass office towers", "mumbai business district", "corporate skyscraper city"],
  bullion: ["gold bullion bars", "gold jewellery india", "precious metals vault"],
  banking: ["bank headquarters skyscraper", "financial district towers", "corporate glass tower"],
  insurance: ["corporate office towers", "modern glass office building", "business district skyline"],
  fintech: ["data center servers technology", "abstract technology network", "fintech circuit board"],
  regulation: ["government building columns", "official document signing", "law courthouse architecture", "parliament building india"],
  news: ["business conference audience", "corporate boardroom meeting", "conference hall presentation", "financial district skyline dusk"],
  buildout: ["skyscraper construction site", "cranes city construction", "architecture blueprint"],
  markets: ["stock exchange trading floor", "financial markets screen", "stock exchange building"],
  default: ["financial district skyline dusk", "mumbai business district", "modern city skyline towers"],
};

// Map a publication desk/kind (for the rail) to a theme.
export function themeForDesk(desk?: string | null): string {
  const d = (desk || "").toLowerCase();
  if (/regulat|circular|consult|notif/.test(d)) return "regulation";
  if (/news|press/.test(d)) return "news";
  if (/speech/.test(d)) return "news";
  if (/tender|sez|career/.test(d)) return "buildout";
  return "default";
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

// A curated image shipped in the repo — never a broken external hotlink.
function fromBundled(theme: string): Hero {
  const list = CREDITS[theme] || CREDITS.default || [];
  if (!list.length) return null;
  const pick = list[dayOfYear() % list.length];
  return {
    url: `/heroes/${pick.file}`,
    title: pick.alt || theme,
    creator: pick.creator,
    creatorUrl: pick.creatorUrl ? `${pick.creatorUrl}?utm_source=gift_city_times&utm_medium=referral` : null,
    license: "Unsplash",
    source: "Unsplash",
    sourceUrl: pick.link,
  };
}

export async function getHeroImage(theme?: string | null): Promise<Hero> {
  const key = (theme || "default").toLowerCase();
  const live = await fromUnsplash(THEME_QUERIES[key] || THEME_QUERIES.default);
  return live || fromBundled(key);
}
