import Link from "next/link";
import { notFound } from "next/navigation";
import { getEntity } from "@/lib/queries";
import { fmtDate, deskLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EntityPage({ params }: { params: { id: string } }) {
  const { entity, people } = await getEntity(params.id);
  if (!entity) notFound();

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
    [
      "Email",
      entity.email ? <a href={`mailto:${entity.email}`}>{entity.email}</a> : null,
    ],
    ["Registered address", entity.registered_address],
    ["Remarks", entity.remarks],
  ];

  return (
    <article style={{ padding: "26px 0", maxWidth: 820 }}>
      <div style={{ marginBottom: 8 }}>
        {entity.desk && (
          <Link href={`/desk/${entity.desk.toLowerCase()}`} className="pill" style={{ textDecoration: "none" }}>
            {deskLabel(entity.desk)} Desk
          </Link>
        )}
      </div>
      <h1 style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, margin: "6px 0 4px" }}>
        {entity.name}
      </h1>

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
        <span>Authorised / Contact Persons</span>
      </div>
      {people.length === 0 ? (
        <p className="empty">No contact person published by IFSCA for this entity.</p>
      ) : (
        people.map((p) => (
          <div className="story" key={p.id}>
            <h3 style={{ fontSize: 18 }}>{p.name}</h3>
            <div className="meta">
              {[p.role, p.email].filter(Boolean).join(" · ")}
            </div>
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
