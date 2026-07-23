import Link from "next/link";
import {
  getCounts,
  getDeskEntities,
  getDeskPublications,
  getRecentChanges,
  type Entity,
  type Publication,
} from "@/lib/queries";
import { fmtDate, deskLabel } from "@/lib/format";
import Subscribe from "@/components/Subscribe";

export const dynamic = "force-dynamic";

function EntityStory({ e }: { e: Entity }) {
  return (
    <div className="story">
      <h3>
        <Link className="title" href={`/entity/${e.id}`}>
          {e.name}
        </Link>
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
      </h3>
      <div className="meta">{fmtDate(p.publish_date)}</div>
    </div>
  );
}

async function DeskColumn({
  desk,
  kind,
}: {
  desk: string;
  kind: "entity" | "pub";
}) {
  const items =
    kind === "entity" ? await getDeskEntities(desk, 6) : await getDeskPublications(desk, 6);
  const slug = desk.toLowerCase();
  return (
    <section>
      <div className="section-head">
        <span>{deskLabel(desk)}</span>
        <Link className="count" href={`/desk/${slug}`} style={{ textDecoration: "none" }}>
          View all →
        </Link>
      </div>
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
  const [{ counts, total }, changes] = await Promise.all([getCounts(), getRecentChanges(12)]);

  if (total === 0) {
    return (
      <div style={{ padding: "40px 0" }}>
        <p className="pill">Awaiting first edition</p>
        <h2 style={{ fontSize: 28, marginTop: 12 }}>The presses are warming up.</h2>
        <p style={{ maxWidth: 560, color: "var(--ink-soft)" }}>
          The GIFT Times has been set up but the first data ingestion hasn’t run yet. Once the
          backfill completes, this page fills with every entity, circular and notice from GIFT IFSC.
        </p>
      </div>
    );
  }

  const numberCells: [string, number][] = [
    ["Total Entities", total],
    ["Brokers", counts["Brokers"] || 0],
    ["Fund Mgrs", counts["FMEs"] || 0],
    ["Insurance", counts["Insurance"] || 0],
    ["Fintech", counts["Fintech"] || 0],
    ["Banking", counts["Banking"] || 0],
  ];

  return (
    <>
      <div className="numbers">
        {numberCells.map(([l, n]) => (
          <div className="cell" key={l}>
            <div className="n">{n.toLocaleString("en-IN")}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      <div className="frontgrid">
        <div>
          <div className="desk-cols">
            <DeskColumn desk="Brokers" kind="entity" />
            <DeskColumn desk="FMEs" kind="entity" />
            <DeskColumn desk="Circulars" kind="pub" />
            <DeskColumn desk="Regulations" kind="pub" />
            <DeskColumn desk="News" kind="pub" />
            <DeskColumn desk="Consultations" kind="pub" />
            <DeskColumn desk="Insurance" kind="entity" />
            <DeskColumn desk="Fintech" kind="entity" />
          </div>
        </div>

        <aside>
          <div className="box">
            <div className="section-head">
              <span>The 6am Edition</span>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 0 }}>
              Every morning, one email: new licences, circulars and notices from GIFT IFSC — by desk.
            </p>
            <Subscribe />
          </div>

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
                <div className="meta">
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
