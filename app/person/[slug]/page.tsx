import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPersonPortfolio, isRealPersonName } from "@/lib/queries";
import { fmtDate, deskLabel } from "@/lib/format";

export const revalidate = 1800;
const SITE = "https://giftcitytimes.com";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const name = decodeURIComponent(params.slug);
  if (!isRealPersonName(name)) return { title: "Person not found", robots: { index: false } };
  const { entities } = await getPersonPortfolio(name);
  if (!entities.length) return { title: "Person not found", robots: { index: false } };
  const title = `${name} — GIFT IFSC authorised person`;
  const description = `${name} is the authorised / contact person for ${entities.length} regulated ${
    entities.length === 1 ? "entity" : "entities"
  } in GIFT IFSC. See their full footprint on GIFT City Times.`;
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: `/person/${encodeURIComponent(name)}` },
    openGraph: { title, description, url: `${SITE}/person/${encodeURIComponent(name)}`, type: "profile" },
  };
}

export default async function PersonPage({ params }: { params: { slug: string } }) {
  const name = decodeURIComponent(params.slug);
  if (!isRealPersonName(name)) notFound();
  const { role, email, entities } = await getPersonPortfolio(name);
  if (!entities.length) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    ...(email ? { email } : {}),
    jobTitle: role || "Authorised person",
    affiliation: entities.slice(0, 25).map((e) => ({ "@type": "Organization", name: e.name })),
  };

  const count = entities.length;

  return (
    <article style={{ padding: "26px 0", maxWidth: 820 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ marginBottom: 8 }}>
        <span className="pill">Authorised Person</span>
      </div>
      <h1 style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, margin: "6px 0 4px" }}>{name}</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 17, lineHeight: 1.5, marginTop: 6, maxWidth: 680 }}>
        {role || "Authorised / contact person"} for {count} regulated {count === 1 ? "entity" : "entities"} across GIFT
        IFSC{email ? ` · ${email}` : ""}.
      </p>

      <div className="section-head" style={{ marginTop: 28 }}>
        <span>Path across GIFT City</span>
        <span className="count">{count}</span>
      </div>
      {entities.map((e) => (
        <div className="story" key={e.id}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            <Link className="title" href={`/entity/${e.id}`}>
              {e.name}
            </Link>
          </h2>
          <div className="meta">
            {[
              [e.category, e.subcategory].filter(Boolean).join(" · "),
              e.desk ? `${deskLabel(e.desk)} Desk` : "",
              e.status && e.status !== "Active" ? e.status : "",
              e.date_of_registration ? `registered ${fmtDate(e.date_of_registration)}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      ))}

      <p style={{ marginTop: 30 }}>
        <Link className="readmore" href="/">
          ← Back to the front page
        </Link>
      </p>
    </article>
  );
}
