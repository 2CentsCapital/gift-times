import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPersonPortfolio, isRealPersonName } from "@/lib/queries";
import { fmtDate, deskLabel, categoryMeta } from "@/lib/format";
import { buildPathTimeline } from "@/lib/person-viz";

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
  const viz = buildPathTimeline(entities);

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
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "2px 0 0" }}>
        Each dot is an entity, placed on the timeline by its registration date — colour shows the sector. Tap a dot to open it.
      </p>

      {viz.hasChart && (
        <div style={{ overflowX: "auto", margin: "14px 0 4px" }}>
          <svg
            viewBox={`0 0 ${viz.width} ${viz.height}`}
            width="100%"
            style={{ maxWidth: viz.width, height: "auto", display: "block" }}
            role="img"
            aria-label={`Timeline of ${count} entities associated with ${name}, by registration date`}
          >
            <line x1={viz.padL} y1={viz.axisY} x2={viz.width - viz.padR} y2={viz.axisY} stroke="var(--rule)" strokeWidth={1.5} />
            {viz.stems.map((s, i) => (
              <line key={i} x1={s.x} y1={viz.axisY} x2={s.x} y2={s.yTop} stroke="var(--rule)" strokeWidth={1.5} />
            ))}
            {viz.dateLabels.map((d, i) => (
              <text
                key={i}
                x={d.x}
                y={viz.axisY + 15}
                fontSize={10}
                textAnchor="end"
                transform={`rotate(-40 ${d.x} ${viz.axisY + 15})`}
                fill="var(--muted)"
                style={{ fontFamily: "var(--sans)" }}
              >
                {d.label}
              </text>
            ))}
            {viz.nodes.map((n) => (
              <a key={n.id} href={`/entity/${n.id}`}>
                <title>{`${n.name} — ${fmtDate(n.date_of_registration)} · ${categoryMeta(n.category || "").label}`}</title>
                <circle cx={n.x} cy={n.y} r={viz.r} fill={n.color} stroke="var(--paper)" strokeWidth={2} />
                <text x={n.x} y={(n.y ?? 0) + 3} fontSize={9} fontWeight={700} textAnchor="middle" fill="#fff" style={{ fontFamily: "var(--sans)" }}>
                  {n.num}
                </text>
              </a>
            ))}
          </svg>
        </div>
      )}

      {viz.families.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", margin: "6px 0 2px" }}>
          {viz.families.map((f) => (
            <span key={f.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--sans)", fontSize: 12, color: "var(--ink-soft)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: f.color }} /> {f.label}
            </span>
          ))}
        </div>
      )}

      <ol style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }}>
        {viz.list.map((item) => (
          <li key={item.id} className="story" style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span
              style={{
                flex: "0 0 auto",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: item.color,
                color: "#fff",
                fontFamily: "var(--sans)",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: "22px",
                textAlign: "center",
              }}
            >
              {item.num}
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
                <Link className="title" href={`/entity/${item.id}`}>
                  {item.name}
                </Link>
              </h2>
              <div className="meta">
                {[
                  [item.category, item.subcategory].filter(Boolean).join(" · "),
                  item.desk ? `${deskLabel(item.desk)} Desk` : "",
                  item.status && item.status !== "Active" ? item.status : "",
                  item.date_of_registration ? `registered ${fmtDate(item.date_of_registration)}` : "date not published",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p style={{ marginTop: 30 }}>
        <Link className="readmore" href="/">
          ← Back to the front page
        </Link>
      </p>
    </article>
  );
}
