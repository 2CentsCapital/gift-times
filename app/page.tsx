import Link from "next/link";
import {
  getCategoryCounts,
  getDeskEntities,
  getDeskPublications,
  getRecentChanges,
  getSezMeetings,
  type Entity,
  type Publication,
} from "@/lib/queries";
import { fmtDate, deskLabel, deskColor, categoryMeta, FAMILY_LEGEND, isRecent } from "@/lib/format";
import Subscribe from "@/components/Subscribe";

export const dynamic = "force-dynamic";

function NewBadge({ date }: { date?: string | null }) {
  return isRecent(date, 7) ? <span className="badge-new">New</span> : null;
}

function EntityStory({ e }: { e: Entity }) {
  return (
    <div className="story">
      <h3>
        <Link className="title" href={`/entity/${e.id}`}>
          {e.name}
        </Link>
        <NewBadge date={e.date_of_registration} />
      </h3>
      <div className="meta">
        {[e.subcategory, e.registration_number, fmtDate(e.date_of_registration)]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

function PubStory({ p }: { p: Publication }) {
  return (
    <div className="story">
      <h3>
        {p.file_url ? (
          <a className="title" href={p.file_url} target="_blank" rel="noopener noreferrer">
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
}

function SectionHead({ desk, slug }: { desk: string; slug: string }) {
  const color = deskColor(desk);
  return (
    <div className="section-head k" style={{ color }}>
      <span>{deskLabel(desk)}</span>
      <Link className="count" href={`/desk/${slug}`} style={{ textDecoration: "none", color: "var(--muted)" }}>
        View all →
      </Link>
    </div>
  );
}

async function SezColumn() {
  const meetings = await getSezMeetings(5);
  return (
    <section>
      <SectionHead desk="SEZ Approvals" slug="sez" />
      {meetings.length === 0 ? (
        <p className="empty">No meetings yet.</p>
      ) : (
        meetings.map((m) => {
          const link =
            m.status === "Minutes Out"
              ? m.minutes_url || m.agenda_url || m.notice_url
              : m.agenda_url || m.notice_url || m.minutes_url;
          return (
            <div className="story" key={m.id}>
              <h3>
                {link ? (
                  <a className="title" href={link} target="_blank" rel="noopener noreferrer">
                    {m.title}
                  </a>
                ) : (
                  m.title
                )}
              </h3>
              <div className="meta">{[m.status, fmtDate(m.meeting_date)].filter(Boolean).join(" · ")}</div>
            </div>
          );
        })
      )}
    </section>
  );
}

async function DeskColumn({ desk, slug, kind }: { desk: string; slug: string; kind: "entity" | "pub" }) {
  const items = kind === "entity" ? await getDeskEntities(desk, 6) : await getDeskPublications(desk, 6);
  return (
    <section>
      <SectionHead desk={desk} slug={slug} />
      {items.length === 0 ? (
        <p className="empty">No entries yet.</p>
      ) : kind === "entity" ? (
        (items as Entity[]).map((e) => <EntityStory key={e.id} e={e} />)
      ) : (
        (items as Publication[]).map((p) => <PubStory key={p.id} p={p} />)
      )}
    </section>
  );
}

export default async function FrontPage() {
  const [{ items: cats, total }, changes] = await Promise.all([
    getCategoryCounts(),
    getRecentChanges(14),
  ]);

  if (total === 0) {
    return (
      <div style={{ padding: "40px 0" }}>
        <p className="pill">Awaiting first edition</p>
        <h2 style={{ fontSize: 28, marginTop: 12 }}>The presses are warming up.</h2>
        <p style={{ maxWidth: 560, color: "var(--ink-soft)" }}>
          The first data ingestion hasn’t run yet. Once the backfill completes, this page fills with
          every entity, circular and notice from GIFT IFSC.
        </p>
      </div>
    );
  }

  const max = cats[0]?.count || 1;

  return (
    <>
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
                <span className="track">
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
          <div className="sb-kicker">The GIFT Times · Free newsletter</div>
          <h2>Every new licence, circular and approval in GIFT IFSC.</h2>
          <p>One email at 6am and 4pm, sorted by desk. Brokers, funds, tenders, UAC approvals and notices, the moment they’re published.</p>
          <div className="sb-note">No spam. Unsubscribe anytime.</div>
        </div>
        <div>
          <Subscribe variant="dark" />
        </div>
      </section>

      <div className="frontgrid">
        <div>
          <div className="desk-cols">
            <DeskColumn desk="Brokers" slug="brokers" kind="entity" />
            <DeskColumn desk="FMEs" slug="fmes" kind="entity" />
            <DeskColumn desk="Circulars" slug="circulars" kind="pub" />
            <DeskColumn desk="Regulations" slug="regulations" kind="pub" />
            <DeskColumn desk="News" slug="news" kind="pub" />
            <DeskColumn desk="Tenders" slug="tenders" kind="pub" />
            <SezColumn />
            <DeskColumn desk="Reports" slug="reports" kind="pub" />
            <DeskColumn desk="Insurance" slug="insurance" kind="entity" />
            <DeskColumn desk="Fintech" slug="fintech" kind="entity" />
          </div>
        </div>

        <aside>
          <div className="section-head">
            <span>Latest Movements</span>
          </div>
          {changes.length === 0 ? (
            <p className="empty">Quiet on the wire. New activity appears here as it happens.</p>
          ) : (
            changes.map((c) => (
              <div className="story" key={c.id}>
                <h3 style={{ fontSize: 15 }}>
                  {c.url && c.url.startsWith("http") ? (
                    <a className="title" href={c.url} target="_blank" rel="noopener noreferrer">
                      {c.headline}
                    </a>
                  ) : c.url ? (
                    <Link className="title" href={c.url}>
                      {c.headline}
                    </Link>
                  ) : (
                    c.headline
                  )}
                </h3>
                <div className="meta" style={{ color: deskColor(c.desk) }}>
                  {[deskLabel(c.desk), fmtDate(c.occurred_on)].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
    </>
  );
}
