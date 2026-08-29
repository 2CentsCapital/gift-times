import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DESK_BY_SLUG, deskLabel, fmtDate, sezStatusColors, categoryMeta } from "@/lib/format";
import { docHref } from "@/lib/doc";
import {
  getEntitiesByDesk,
  getDeskPublications,
  getSezMeetings,
  isEntityDesk,
} from "@/lib/queries";

export const revalidate = 900;

const SITE = "https://giftcitytimes.com";

export async function generateMetadata({ params }: { params: { desk: string } }): Promise<Metadata> {
  const desk = DESK_BY_SLUG[params.desk];
  if (!desk) return { title: "Not found", robots: { index: false } };
  const label = deskLabel(desk);
  const title = `${label} in GIFT IFSC`;
  const description = `${BLURB[desk] || label + " in GIFT IFSC."} Tracked and updated twice daily on GIFT City Times.`;
  return {
    title,
    description,
    alternates: { canonical: `/desk/${params.desk}` },
    openGraph: { title, description, url: `${SITE}/desk/${params.desk}`, type: "website" },
  };
}

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
  const entities = entityMode ? await getEntitiesByDesk(desk, 1000) : [];
  const pubs = entityMode || sezMode ? [] : await getDeskPublications(desk, 500);
  const meetings = sezMode ? await getSezMeetings(200) : [];

  // Group entity rows by category → subcategory so the sub-structure is visible.
  const groups = (() => {
    const byCat = new Map<string, Map<string, typeof entities>>();
    for (const e of entities) {
      const cat = e.category || "Other";
      const sub = e.subcategory || "Unclassified";
      if (!byCat.has(cat)) byCat.set(cat, new Map());
      const sm = byCat.get(cat)!;
      if (!sm.has(sub)) sm.set(sub, []);
      sm.get(sub)!.push(e);
    }
    return [...byCat.entries()]
      .map(([cat, sm]) => ({
        cat,
        total: [...sm.values()].reduce((n, a) => n + a.length, 0),
        subs: [...sm.entries()]
          .map(([sub, arr]) => ({ sub, arr }))
          .sort((a, b) => b.arr.length - a.arr.length),
      }))
      .sort((a, b) => b.total - a.total);
  })();
  const multiCat = groups.length > 1;

  return (
    <div style={{ padding: "24px 0" }}>
      <div className="section-head">
        <h1>{deskLabel(desk)} Desk</h1>
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
                      <a className="readmore" href={docHref(url)} target="_blank" rel="noopener noreferrer">
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
          groups.map((g) => (
            <section key={g.cat}>
              {multiCat && (
                <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.2, margin: "34px 0 2px", color: "var(--ink)" }}>
                  {categoryMeta(g.cat).label}
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>
                    · {g.total}
                  </span>
                </h2>
              )}
              {g.subs.map(({ sub, arr }) => (
                <div key={sub}>
                  <div
                    aria-label={`Subcategory: ${sub}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      margin: multiCat ? "18px 0 8px" : "28px 0 8px",
                      paddingBottom: 6,
                      borderBottom: "1px solid var(--rule)",
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: categoryMeta(g.cat).color, flex: "0 0 auto" }} />
                    <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--ink)" }}>
                      {sub}
                    </span>
                    <span style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)" }}>{arr.length}</span>
                  </div>
                  {arr.map((e) => (
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
                        {[e.registration_number, e.contact_person, fmtDate(e.date_of_registration)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))
        )
      ) : pubs.length === 0 ? (
        <p className="empty">No publications recorded yet.</p>
      ) : (
        pubs.map((p) => {
          const dh = docHref(p.file_url);
          return (
          <div className="story" key={p.id}>
            <h3>
              {dh ? (
                <a className="title" href={dh} target="_blank" rel="noopener noreferrer">
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
          );
        })
      )}
    </div>
  );
}
