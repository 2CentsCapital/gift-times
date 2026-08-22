import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEntity, getEntityVersions, getEntityChanges, getPeopleConnections } from "@/lib/queries";
import { fmtDate, deskLabel } from "@/lib/format";
import { buildTimeline } from "@/lib/timeline";

// ISR: entity pages change rarely; cache and revalidate every 30 min.
export const revalidate = 1800;

const SITE = "https://giftcitytimes.com";

function summarize(e: any): string {
  const kind = e.subcategory || e.category || "regulated entity";
  const parts = [`${e.name} is registered in GIFT IFSC as ${kind}`];
  if (e.registration_number) parts.push(`under IFSCA registration ${e.registration_number}`);
  if (e.date_of_registration) parts.push(`registered on ${fmtDate(e.date_of_registration)}`);
  return parts.join(", ") + ".";
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { entity } = await getEntity(params.id);
  if (!entity) return { title: "Entity not found", robots: { index: false } };
  const kind = entity.subcategory || entity.category || "regulated entity";
  const title = `${entity.name} — GIFT IFSC ${entity.category || "entity"}`;
  const description =
    `${entity.name}: ${kind} in GIFT IFSC` +
    (entity.registration_number ? `, IFSCA reg. ${entity.registration_number}` : "") +
    `. Registration details, validity, contact and status on GIFT City Times.`;
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: `/entity/${entity.id}` },
    openGraph: { title, description, url: `${SITE}/entity/${entity.id}`, type: "profile" },
    robots: entity.status === "Removed" ? { index: false, follow: true } : undefined,
  };
}

export default async function EntityPage({ params }: { params: { id: string } }) {
  const { entity, people } = await getEntity(params.id);
  if (!entity) notFound();

  const personNames = [...people.map((p: any) => p.name), entity.contact_person].filter(Boolean) as string[];
  const [versions, changeRows, connections] = await Promise.all([
    getEntityVersions(entity.id),
    getEntityChanges(entity.id),
    getPeopleConnections(entity.id, personNames),
  ]);
  const timeline = buildTimeline(entity, versions, changeRows);

  const rows: [string, React.ReactNode][] = [
    ["Category", [entity.category, entity.subcategory].filter(Boolean).join(" · ")],
    ["Registration No.", entity.registration_number],
    ["Registered", fmtDate(entity.date_of_registration)],
    ["Valid until", fmtDate(entity.validity_to)],
    ["Status", entity.status],
    [
      "Website",
      entity.website ? (
        <a href={entity.website} target="_blank" rel="noopener noreferrer">
          {entity.website}
        </a>
      ) : null,
    ],
    ["Email", entity.email ? <a href={`mailto:${entity.email}`}>{entity.email}</a> : null],
    ["Registered address", entity.registered_address],
    ["Remarks", entity.remarks],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: entity.name,
        ...(entity.website ? { url: entity.website } : {}),
        ...(entity.email ? { email: entity.email } : {}),
        ...(entity.registered_address ? { address: entity.registered_address } : {}),
        ...(entity.registration_number ? { identifier: entity.registration_number } : {}),
        description: summarize(entity),
        memberOf: { "@type": "Organization", name: "International Financial Services Centres Authority (IFSCA)" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GIFT City Times", item: SITE },
          ...(entity.desk
            ? [{ "@type": "ListItem", position: 2, name: `${deskLabel(entity.desk)}`, item: `${SITE}/desk/${entity.desk.toLowerCase()}` }]
            : []),
          { "@type": "ListItem", position: entity.desk ? 3 : 2, name: entity.name, item: `${SITE}/entity/${entity.id}` },
        ],
      },
    ],
  };

  return (
    <article style={{ padding: "26px 0", maxWidth: 820 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ marginBottom: 8 }}>
        {entity.desk && (
          <Link href={`/desk/${entity.desk.toLowerCase()}`} className="pill" style={{ textDecoration: "none" }}>
            {deskLabel(entity.desk)} Desk
          </Link>
        )}
      </div>
      <h1 style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, margin: "6px 0 4px" }}>{entity.name}</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 17, lineHeight: 1.5, marginTop: 6, maxWidth: 680 }}>
        {summarize(entity)}
      </p>

      <div className="section-head" style={{ marginTop: 28 }}>
        <span>Registration Details</span>
      </div>
      <dl className="detail-grid">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>

      <div className="section-head" style={{ marginTop: 30 }}>
        <span>History</span>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "2px 0 0" }}>
        Field-level changes recorded from IFSCA — this record deepens over time.
      </p>
      {timeline.length === 0 ? (
        <p className="empty">No recorded history yet.</p>
      ) : (
        <ol style={{ listStyle: "none", margin: "16px 0 0", padding: 0, borderLeft: "2px solid var(--rule)" }}>
          {timeline.map((e, i) => (
            <li key={i} style={{ position: "relative", padding: "0 0 18px 22px" }}>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: -5,
                  top: 4,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: ["registered", "entity_added"].includes(e.kind) ? "var(--accent)" : "var(--ink-soft)",
                }}
              />
              <div style={{ font: "600 11px/1 var(--sans)", letterSpacing: ".4px", color: "var(--muted)", textTransform: "uppercase" }}>
                {fmtDate(e.date)}
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.4, marginTop: 3 }}>{e.title}</div>
            </li>
          ))}
        </ol>
      )}

      <div className="section-head" style={{ marginTop: 30 }}>
        <span>Authorised / Contact Persons</span>
      </div>
      {people.length === 0 ? (
        <p className="empty">No contact person published by IFSCA for this entity.</p>
      ) : (
        people.map((p) => (
          <div className="story" key={p.id}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>{p.name}</h2>
            <div className="meta">{[p.role, p.email].filter(Boolean).join(" · ")}</div>
          </div>
        ))
      )}

      <div className="section-head" style={{ marginTop: 30 }}>
        <span>Connections</span>
      </div>
      {connections.length === 0 ? (
        <p className="empty">No shared authorised persons found elsewhere in the register.</p>
      ) : (
        connections.map((g) => (
          <div className="story" key={g.name}>
            <div className="meta">
              Shares authorised person <strong>{g.name}</strong> with {g.entities.length} other
              {g.entities.length === 1 ? "" : "s"}
            </div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {g.entities.map((en) => (
                <li key={en.id} style={{ marginBottom: 4 }}>
                  <Link href={`/entity/${en.id}`}>{en.name}</Link>
                  <span style={{ color: "var(--muted)" }}>
                    {en.desk ? ` · ${deskLabel(en.desk)}` : ""}
                    {en.status && en.status !== "Active" ? ` · ${en.status}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <p style={{ marginTop: 30 }}>
        <Link className="readmore" href="/">
          ← Back to the front page
        </Link>
      </p>
    </article>
  );
}
