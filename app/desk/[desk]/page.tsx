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

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { desk: string };
  searchParams: { sub?: string };
}): Promise<Metadata> {
  const desk = DESK_BY_SLUG[params.desk];
  if (!desk) return { title: "Not found", robots: { index: false } };
  const label = deskLabel(desk);
  const sub = typeof searchParams?.sub === "string" ? searchParams.sub : undefined;
  const title = sub ? `${sub} — ${label} in GIFT IFSC` : `${label} in GIFT IFSC`;
  const description = `${BLURB[desk] || label + " in GIFT IFSC."} Tracked and updated twice daily on GIFT City Times.`;
  return {
    title,
    description,
    // Filtered views share the desk's canonical and aren't indexed (avoid dup content).
    alternates: { canonical: `/desk/${params.desk}` },
    openGraph: { title, description, url: `${SITE}/desk/${params.desk}`, type: "website" },
    ...(sub ? { robots: { index: false, follow: true } } : {}),
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

function EntityRow({ e }: { e: any }) {
  return (
    <div className="story">
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
        {[e.registration_number, e.contact_person, fmtDate(e.date_of_registration)].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

export default async function DeskPage({
  params,
  searchParams,
}: {
  params: { desk: string };
  searchParams: { sub?: string };
}) {
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

  // Flat subcategory index for the filter bar (across every category in the desk),
  // and the currently-selected subcategory (if any).
  const subIndex = (() => {
    const m = new Map<string, { name: string; count: number; cat: string }>();
    for (const e of entities) {
      const name = e.subcategory || "Unclassified";
      const cur = m.get(name);
      if (cur) cur.count++;
      else m.set(name, { name, count: 1, cat: e.category || "Other" });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  })();
  const activeSub = typeof searchParams?.sub === "string" ? searchParams.sub : undefined;
  const activeMeta = activeSub ? subIndex.find((s) => s.name === activeSub) : undefined;
  const filtered = activeSub ? entities.filter((e) => (e.subcategory || "Unclassified") === activeSub) : entities;

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
          <>
            {/* Subcategory filter bar — every subcategory, always visible, one click to isolate it. */}
            <nav className="subnav" aria-label="Filter by subcategory">
              <Link href={`/desk/${params.desk}`} className={!activeSub ? "active" : ""}>
                All <span className="n">{entities.length}</span>
              </Link>
              {subIndex.map((s) => (
                <Link
                  key={s.name}
                  href={`/desk/${params.desk}?sub=${encodeURIComponent(s.name)}`}
                  className={activeSub === s.name ? "active" : ""}
                >
                  {s.name} <span className="n">{s.count}</span>
                </Link>
              ))}
            </nav>

            {activeSub ? (
              /* One subcategory, completely separated. */
              <>
                <div className="section-head" style={{ marginTop: 10 }}>
                  <h2 style={{ fontSize: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: categoryMeta(activeMeta?.cat || "").color, flex: "0 0 auto" }} />
                    {activeSub}
                  </h2>
                  <span className="count">{filtered.length}</span>
                </div>
                {multiCat && activeMeta && (
                  <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 6px" }}>in {categoryMeta(activeMeta.cat).label}</p>
                )}
                {filtered.length === 0 ? (
                  <p className="empty">No entities in this subcategory.</p>
                ) : (
                  filtered.map((e) => <EntityRow key={e.id} e={e} />)
                )}
              </>
            ) : (
              /* Overview — each subcategory as its own block, previewed, with a link to the full list. */
              groups.map((g) => (
                <section key={g.cat}>
                  {multiCat && (
                    <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.2, margin: "30px 0 2px", color: "var(--ink)" }}>
                      {categoryMeta(g.cat).label}
                      <span style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>· {g.total}</span>
                    </h2>
                  )}
                  {g.subs.map(({ sub, arr }) => (
                    <div key={sub}>
                      <Link
                        href={`/desk/${params.desk}?sub=${encodeURIComponent(sub)}`}
                        aria-label={`View only ${sub}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          margin: multiCat ? "16px 0 8px" : "22px 0 8px",
                          paddingBottom: 6,
                          borderBottom: "1px solid var(--rule)",
                          textDecoration: "none",
                        }}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: categoryMeta(g.cat).color, flex: "0 0 auto" }} />
                        <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--ink)" }}>{sub}</span>
                        <span style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)" }}>{arr.length}</span>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--sans)", fontSize: 11, color: "var(--accent)" }}>view →</span>
                      </Link>
                      {arr.slice(0, 8).map((e) => <EntityRow key={e.id} e={e} />)}
                      {arr.length > 8 && (
                        <Link className="readmore" href={`/desk/${params.desk}?sub=${encodeURIComponent(sub)}`} style={{ display: "inline-block", margin: "2px 0 6px" }}>
                          See all {arr.length} →
                        </Link>
                      )}
                    </div>
                  ))}
                </section>
              ))
            )}
          </>
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
