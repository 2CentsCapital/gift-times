import Link from "next/link";
import { notFound } from "next/navigation";
import { DESK_BY_SLUG, deskLabel, fmtDate, sezStatusColors } from "@/lib/format";
import {
  getEntitiesByDesk,
  getDeskPublications,
  getSezMeetings,
  isEntityDesk,
} from "@/lib/queries";

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
  "SEZ Approvals":
    "Unit Approval Committee (UAC) meetings — notices, agendas, approvals and minutes. Signals who is coming to GIFT and who got set-up approval.",
};

function docLinks(m: {
  notice_url: string | null;
  agenda_url: string | null;
  approval_url: string | null;
  minutes_url: string | null;
}) {
  const docs: [string, string | null][] = [
    ["Notice", m.notice_url],
    ["Agenda", m.agenda_url],
    ["Approval", m.approval_url],
    ["Minutes", m.minutes_url],
  ];
  return docs.filter(([, u]) => u);
}

export default async function DeskPage({ params }: { params: { desk: string } }) {
  const desk = DESK_BY_SLUG[params.desk];
  if (!desk) notFound();

  const sezMode = desk === "SEZ Approvals";
  const entityMode = isEntityDesk(desk) || desk === "Surrendered";
  const entities = entityMode ? await getEntitiesByDesk(desk, 300) : [];
  const pubs = entityMode || sezMode ? [] : await getDeskPublications(desk, 500);
  const meetings = sezMode ? await getSezMeetings(200) : [];

  return (
    <div style={{ padding: "24px 0" }}>
      <div className="section-head">
        <span>{deskLabel(desk)} Desk</span>
        <span className="count">
          {(sezMode ? meetings.length : entityMode ? entities.length : pubs.length)} entries
        </span>
      </div>
      <p style={{ color: "var(--ink-soft)", marginTop: 0, maxWidth: 640 }}>{BLURB[desk]}</p>

      {sezMode ? (
        meetings.length === 0 ? (
          <p className="empty">No UAC meetings recorded yet.</p>
        ) : (
          meetings.map((m) => {
            const sc = sezStatusColors(m.status);
            return (
              <div className="story" key={m.id}>
                <h3>
                  {m.title}
                  <span
                    style={{
                      display: "inline-block",
                      fontFamily: "var(--sans)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: sc.color,
                      background: sc.bg,
                      padding: "2px 8px",
                      borderRadius: 999,
                      marginLeft: 10,
                      verticalAlign: "middle",
                    }}
                  >
                    {m.status || "—"}
                  </span>
                </h3>
                <div className="meta">
                  {fmtDate(m.meeting_date)}
                  {docLinks(m).map(([label, url]) => (
                    <span key={label}>
                      {" · "}
                      <a className="readmore" href={url!} target="_blank" rel="noopener noreferrer">
                        {label}
                      </a>
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )
      ) : entityMode ? (
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
