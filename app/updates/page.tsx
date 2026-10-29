import type { Metadata } from "next";
import { getRecentChanges } from "@/lib/queries";
import { WireRow, cleanHeadline, type Row } from "@/lib/wire";

export const revalidate = 900;

const SITE = "https://giftcitytimes.com";

export const metadata: Metadata = {
  title: "Latest Updates — every GIFT IFSC change by date",
  description:
    "Every new registration, licence surrender, UAC approval, circular and filing in GIFT IFSC, newest first and grouped by day. Tracked and updated twice daily on GIFT City Times.",
  alternates: { canonical: "/updates" },
  openGraph: {
    title: "Latest Updates — GIFT IFSC daily activity",
    description: "Every GIFT IFSC registration, surrender, UAC approval and filing, by date.",
    url: `${SITE}/updates`,
    type: "website",
  },
};

// A full date heading for a day's group, e.g. "Thursday, 29 October 2026".
function dayHeading(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function UpdatesPage() {
  const changes = (await getRecentChanges(1000)) as Row[];

  // Drop empties and exact same-day duplicate headlines, keeping chronological order.
  const seen = new Set<string>();
  const rows = changes.filter((c) => {
    const h = cleanHeadline(c);
    if (!h) return false;
    const key = `${c.occurred_on}|${h}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group into days (rows are already newest-first, so days come out newest-first too).
  const days: { date: string; items: Row[] }[] = [];
  for (const c of rows) {
    const last = days[days.length - 1];
    if (last && last.date === c.occurred_on) last.items.push(c);
    else days.push({ date: c.occurred_on, items: [c] });
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GIFT City Times", item: SITE },
          { "@type": "ListItem", position: 2, name: "Latest Updates", item: `${SITE}/updates` },
        ],
      },
      {
        "@type": "ItemList",
        name: "GIFT IFSC — Latest Updates",
        numberOfItems: rows.length,
        itemListElement: rows.slice(0, 100).map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: cleanHeadline(c),
        })),
      },
    ],
  };

  return (
    <div style={{ padding: "24px 0" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="section-head">
        <h1>Latest Updates</h1>
        <span className="count">{rows.length} entries</span>
      </div>
      <p style={{ color: "var(--ink-soft)", marginTop: 0, maxWidth: 640 }}>
        Every new registration, licence surrender, UAC approval, circular and filing in GIFT IFSC,
        newest first. Updated twice daily, the moment IFSCA publishes.
      </p>

      {days.length === 0 ? (
        <p className="empty">Quiet on the wire. New activity appears here the moment IFSCA posts it.</p>
      ) : (
        days.map((d) => (
          <section className="updates-day" key={d.date}>
            <h2 className="updates-date">{dayHeading(d.date)}</h2>
            <div className="doc-list">
              {d.items.map((c) => (
                <WireRow key={c.id} c={c} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
