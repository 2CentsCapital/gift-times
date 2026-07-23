import Link from "next/link";
import { notFound } from "next/navigation";
import { DESK_BY_SLUG, deskLabel, fmtDate } from "@/lib/format";
import { getEntitiesByDesk, getDeskPublications, isEntityDesk } from "@/lib/queries";

export const dynamic = "force-dynamic";

const BLURB: Record<string, string> = {
  Brokers: "Capital-market intermediaries registered in GIFT IFSC.",
  FMEs: "Fund management entities and their registered schemes.",
  Insurance: "IFSC insurance offices (IIO) and intermediaries (IIIO).",
  Fintech: "Entities in the IFSCA regulatory & innovation sandbox.",
  Banking: "IFSC banking units, finance companies and payment providers.",
  Circulars: "Circulars issued by IFSCA.",
  Regulations: "Regulations, notifications, rules, guidelines and AML/CFT/KYC.",
  News: "Press releases and news from IFSCA.",
  Consultations: "Public consultation papers open for comment.",
  Surrendered: "Registrations surrendered or cancelled.",
};

export default async function DeskPage({ params }: { params: { desk: string } }) {
  const desk = DESK_BY_SLUG[params.desk];
  if (!desk) notFound();

  const entityMode = isEntityDesk(desk) || desk === "Surrendered";
  const entities = entityMode ? await getEntitiesByDesk(desk, 300) : [];
  const pubs = entityMode ? [] : await getDeskPublications(desk, 200);

  return (
    <div style={{ padding: "24px 0" }}>
      <div className="section-head">
        <span>{deskLabel(desk)} Desk</span>
        <span className="count">{entityMode ? entities.length : pubs.length} entries</span>
      </div>
      <p style={{ color: "var(--ink-soft)", marginTop: 0, maxWidth: 640 }}>{BLURB[desk]}</p>

      {entityMode ? (
        entities.length === 0 ? (
          <p className="empty">No entities recorded yet.</p>
        ) : (
          entities.map((e) => (
            <div className="story" key={e.id}>
              <h3>
                <Link className="title" href={`/entity/${e.id}`}>
                  {e.name}
                </Link>
                {e.status && e.status !== "Active" && (
                  <span className="pill" style={{ marginLeft: 10 }}>
                    {e.status}
                  </span>
                )}
              </h3>
              <div className="meta">
                {[e.subcategory, e.registration_number, e.contact_person, fmtDate(e.date_of_registration)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))
        )
      ) : pubs.length === 0 ? (
        <p className="empty">No publications recorded yet.</p>
      ) : (
        pubs.map((p) => (
          <div className="story" key={p.id}>
            <h3>
              {p.file_url ? (
                <a className="title" href={p.file_url} target="_blank" rel="noopener noreferrer">
                  {p.title}
                </a>
              ) : (
                p.title
              )}
            </h3>
            <div className="meta">
              {[p.kind && p.kind[0].toUpperCase() + p.kind.slice(1), fmtDate(p.publish_date)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
