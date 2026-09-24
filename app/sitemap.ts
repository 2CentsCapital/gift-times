import type { MetadataRoute } from "next";
import { getSupabase } from "@/lib/supabase";
import { DESKS } from "@/lib/format";
import { TOWER_KEYS } from "@/lib/towers";

const SITE = "https://giftcitytimes.com";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/towers`, changeFrequency: "daily", priority: 0.8 },
  ];

  for (const key of TOWER_KEYS) {
    urls.push({ url: `${SITE}/towers/${key}`, changeFrequency: "weekly", priority: 0.7 });
  }

  for (const d of DESKS) {
    urls.push({ url: `${SITE}/desk/${d.slug}`, changeFrequency: "daily", priority: 0.7 });
  }

  // Every non-removed entity gets a URL (the bulk of the programmatic SEO).
  try {
    const supa = getSupabase();
    for (let from = 0; ; from += 1000) {
      const { data } = await supa
        .from("entities")
        .select("id, last_seen, first_seen")
        .neq("status", "Removed")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      for (const e of data) {
        urls.push({
          url: `${SITE}/entity/${e.id}`,
          lastModified: e.last_seen || e.first_seen || undefined,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
      if (data.length < 1000) break;
    }
  } catch {
    /* if the DB is unreachable, still return the static URLs */
  }

  return urls;
}
