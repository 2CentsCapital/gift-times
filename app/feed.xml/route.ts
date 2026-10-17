import { getRecentChanges } from "@/lib/queries";
import { docHref } from "@/lib/doc";
import { DESKS } from "@/lib/format";

// RSS 2.0 feed of GIFT IFSC filings — new licences, circulars, regulations,
// surrenders and UAC approvals. Refreshed every 30 min (ingest is twice daily).
const SITE = "https://giftcitytimes.com";
export const revalidate = 1800;

const esc = (s: string) =>
  (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function deskSlug(desk?: string | null): string | null {
  if (!desk) return null;
  return DESKS.find((d) => d.label === desk)?.slug || null;
}

// A readable label for a change type (e.g. "entity_added" → "New registration").
function typeLabel(t?: string | null): string {
  switch (t) {
    case "entity_added":
      return "New registration";
    case "entity_removed":
      return "Registration surrendered";
    case "publication_added":
      return "New publication";
    default:
      return (t || "Update").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

function itemLink(url: string | null, desk: string | null): string {
  if (url) {
    const dh = docHref(url);
    if (dh) return dh.startsWith("/") ? SITE + dh : dh;
  }
  const slug = deskSlug(desk);
  return slug ? `${SITE}/desk/${slug}` : SITE;
}

export async function GET() {
  const changes = await getRecentChanges(60);
  const now = new Date().toUTCString();

  const items = changes
    .map((c) => {
      const link = itemLink(c.url, c.desk);
      const date = c.occurred_on ? new Date(c.occurred_on) : null;
      const pub = date && !isNaN(date.getTime()) ? date.toUTCString() : now;
      const desc = [typeLabel(c.change_type), c.desk].filter(Boolean).join(" · ");
      return `    <item>
      <title>${esc(c.headline || typeLabel(c.change_type))}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">giftcitytimes:${esc(c.id)}</guid>
      <pubDate>${pub}</pubDate>
      <category>${esc(c.desk || "GIFT IFSC")}</category>
      <description>${esc(desc)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GIFT City Times — GIFT IFSC filings</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>New licences, circulars, regulations, surrenders and UAC approvals from GIFT IFSC, updated twice daily from IFSCA.</description>
    <language>en-IN</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>180</ttl>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
