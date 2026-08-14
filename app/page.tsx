import Link from "next/link";
import {
  getCategoryCounts,
  getDeskEntities,
  getDeskPublications,
  getRecentChanges,
  type Entity,
  type Publication,
  type Change,
} from "@/lib/queries";
import { fmtDate, deskLabel, deskColor, categoryMeta, FAMILY_LEGEND, isRecent } from "@/lib/format";
import { docHref } from "@/lib/doc";
import Subscribe from "@/components/Subscribe";

export const revalidate = 900; // ISR: refresh every 15 min (ingest is twice daily)

function NewBadge({ date }: { date?: string | null }) {
  return isRecent(date, 7) ? <span className="badge-new">New</span> : null;
}

// One clean, scannable row: coloured desk tag · headline · date.
function LatestRow({ c }: { c: Change }) {
  const href = docHref(c.url);
  const external = !!href && (href.startsWith("http") || href.startsWith("/d?"));
  const inner = (
    <>
      <span className="tag" style={{ background: deskColor(c.desk) }}>
        {deskLabel(c.desk)}
      </span>
      <span className="hl">{c.headline}</span>
      <span className="dt">{fmtDate(c.occurred_on)}</span>
    </>
  );
  if (external)
    return (
      <a className="latest-row" href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  if (href)
    return (
      <Link className="latest-row" href={href}>
        {inner}
      </Link>
    );
  return <div className="latest-row">{inner}</div>;
}

function MiniDesk({
  title,
  slug,
  color,
  entities,
  pubs,
}: {
  title: string;
  slug: string;
  color: string;
  entities?: Entity[];
  pubs?: Publication[];
}) {
  return (
    <div className="mini">
      <div className="section-head k" style={{ color }}>
        <span>{title}</span>
        <Link className="count" href={`/desk/${slug}`} style={{ textDecoration: "none", color: "var(--muted)" }}>
          All →
        </Link>
      </div>
      {entities?.map((e) => (
        <div className="story" key={e.id}>
          <h3 className="clamp2">
            <Link className="title" href={`/entity/${e.id}`}>
              {e.name}
            </Link>
            <NewBadge date={e.date_of_registration} />
          </h3>
          <div className="meta">{[e.subcategory, fmtDate(e.date_of_registration)].filter(Boolean).join(" · ")}</div>
        </div>
      ))}
      {pubs?.map((p) => {
        const dh = docHref(p.file_url);
        return (
          <div className="story" key={p.id}>
            <h3 className="clamp2">
              {dh ? (
                <a className="title" href={dh} target="_blank" rel="noopener noreferrer">
                  {p.title}
                </a>
              ) : (
                p.title
              )}
              <NewBadge date={p.publish_date} />
            </h3>
            <div className="meta">{fmtDate(p.publish_date)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default async function FrontPage() {
  const [{ items: cats, total }, changes, brokers, fmes, circulars, regulations, tenders, reports] =
    await Promise.all([
      getCategoryCounts(),
      getRecentChanges(16),
      getDeskEntities("Brokers", 3),
      getDeskEntities("FMEs", 3),
      getDeskPublications("Circulars", 3),
      getDeskPublications("Regulations", 3),
      getDeskPublications("Tenders", 3),
      getDeskPublications("Reports", 3),
    ]);

  if (total === 0) {
    return (
      <div style={{ padding: "40px 0" }}>
        <p className="pill">Awaiting first edition</p>
        <h2 style={{ fontSize: 28, marginTop: 12 }}>The presses are warming up.</h2>
        <p style={{ maxWidth: 560, color: "var(--ink-soft)" }}>
          The first data ingestion hasn’t run yet. Once it does, this page fills with everything new
          from GIFT IFSC.
        </p>
      </div>
    );
  }

  const max = cats[0]?.count || 1;

  return (
    <>
      <h1 className="sr-only">
        GIFT City Times — GIFT IFSC entity registry, circulars, tenders and daily updates
      </h1>

      {/* Directory at a glance — honest breakdown that sums to the total */}
      <section className="statband">
        <div className="stat-head">
          <div className="stat-total">
            <span className="n">{total.toLocaleString("en-IN")}</span>
            <span className="l">regulated entities across GIFT IFSC</span>
          </div>
          <div className="legend">
            {FAMILY_LEGEND.map((f) => (
              <span className="legend-item" key={f.label}>
                <span className="legend-dot" style={{ background: f.color }} />
                {f.label}
              </span>
            ))}
          </div>
        </div>
        <div className="barlist">
          {cats.map((c) => {
            const m = categoryMeta(c.category);
            return (
              <div className="barrow" key={c.category}>
                <span className="label" title={m.label}>
                  {m.label}
                </span>
                <span className="track" aria-hidden="true">
                  <span className="fill" style={{ width: `${(c.count / max) * 100}%`, background: m.color }} />
                </span>
                <span className="num">{c.count.toLocaleString("en-IN")}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Subscribe — bold, unmissable */}
      <section className="subscribe-band">
        <div>
          <div className="sb-kicker">GIFT City Times · Free newsletter</div>
          <h2>Every new licence, circular and approval in GIFT IFSC.</h2>
          <p>One email at 6am and 4pm, sorted by desk. The moment it’s published.</p>
          <div className="sb-note">No spam. Unsubscribe anytime.</div>
        </div>
        <div>
          <Subscribe variant="dark" />
        </div>
      </section>

      {/* The Latest — the single, scannable "what's new" feed */}
      <section className="latest">
        <div className="section-head">
          <span>The Latest</span>
          <span className="count">across every desk</span>
        </div>
        {changes.length === 0 ? (
          <p className="empty">Quiet on the wire. New activity shows here the moment IFSCA posts it.</p>
        ) : (
          <div className="latest-feed">
            {changes.map((c) => (
              <LatestRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      {/* Browse by desk — calm, clamped, breathing room */}
      <section className="browse">
        <div className="section-head">
          <span>Browse by Desk</span>
        </div>
        <div className="calm-grid">
          <MiniDesk title="New Brokers" slug="brokers" color={deskColor("Brokers")} entities={brokers} />
          <MiniDesk title="New Fund Managers" slug="fmes" color={deskColor("FMEs")} entities={fmes} />
          <MiniDesk title="Circulars" slug="circulars" color={deskColor("Circulars")} pubs={circulars} />
          <MiniDesk title="Regulations" slug="regulations" color={deskColor("Regulations")} pubs={regulations} />
          <MiniDesk title="Tenders" slug="tenders" color={deskColor("Tenders")} pubs={tenders} />
          <MiniDesk title="Reports & Studies" slug="reports" color={deskColor("Reports")} pubs={reports} />
        </div>
      </section>
    </>
  );
}
