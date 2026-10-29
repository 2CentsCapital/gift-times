import Link from "next/link";
import {
  getCounts,
  getCategoryCard,
  getDeskEntities,
  getDeskPublications,
  getRecentChanges,
  type Entity,
  type Publication,
  type Change,
} from "@/lib/queries";
import { fmtDate, DESKS } from "@/lib/format";
import { docHref } from "@/lib/doc";
import { getHeroImage, themeForDesk } from "@/lib/heroImage";
import { buildLead } from "@/lib/lead";
import Subscribe from "@/components/Subscribe";

export const revalidate = 900; // ISR: refresh every 15 min (ingest is twice daily)

function shortDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .toUpperCase();
}

// A row in "Latest Updates" — one entry from the change log (a new
// registration, filing, UAC approval or surrender), newest first.
type Row = Change & { ref_id?: string; ref_table?: string };

function cleanHeadline(c: Row): string {
  let h = c.headline || "";
  // Drop the "New broker / ...:" or "New circular:" prefix — the tag carries that.
  if (c.change_type === "entity_added" || c.change_type === "publication_added") {
    h = h.replace(/^new\s+[^:]*:\s*/i, "");
  }
  // Em dashes out of ingested text — a comma reads cleaner.
  return h.replace(/\s*—\s*/g, ", ").trim();
}

function changeTag(c: Row): string {
  const t = c.change_type || "";
  if (t.startsWith("sez_")) return "UAC";
  if (t === "entity_added") return "New firm";
  if (t === "entity_removed") return "Exit";
  if (t.startsWith("entity_status")) return "Status";
  if (t.startsWith("entity_")) return "Update";
  if (t === "publication_added") {
    const map: Record<string, string> = {
      Circulars: "Circular", Regulations: "Regulation", News: "News", Tenders: "Tender",
      Consultations: "Consultation", Reports: "Report", Guidance: "Guidance", Speeches: "Speech",
    };
    return map[c.desk] || c.desk || "Filing";
  }
  return c.desk || "Update";
}

function changeLink(c: Row): { href?: string; external?: boolean } {
  const t = c.change_type || "";
  if (t.startsWith("entity_") && c.ref_table === "entities" && c.ref_id) return { href: `/entity/${c.ref_id}` };
  if (t.startsWith("sez_")) return { href: "/desk/sez" };
  if (t === "publication_added") {
    const dh = docHref(c.url);
    if (dh) return { href: dh, external: true };
    const slug = DESKS.find((d) => d.label === c.desk)?.slug;
    if (slug) return { href: `/desk/${slug}` };
  }
  return {};
}

function WireRow({ c }: { c: Row }) {
  const { href, external } = changeLink(c);
  const body = (
    <>
      <span className="doc-date">{fmtDate(c.occurred_on)}</span>
      <span className="doc-title">{cleanHeadline(c)}</span>
      <span className="doc-tag">{changeTag(c)}</span>
    </>
  );
  if (!href) return <div className="doc-row">{body}</div>;
  return external ? (
    <a className="doc-row" href={href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <Link className="doc-row" href={href}>
      {body}
    </Link>
  );
}

// One entity line inside a register card.
function RegLine({ e }: { e: Entity }) {
  return (
    <Link className="reg-line" href={`/entity/${e.id}`}>
      <span className="reg-line-k">{e.subcategory || e.category || "Registered"}</span>
      <span className="reg-line-name">{e.name}</span>
      <span className="reg-line-dt">{fmtDate(e.date_of_registration)}</span>
    </Link>
  );
}

function RegisterCard({
  title,
  slug,
  blurb,
  count,
  entities,
}: {
  title: string;
  slug: string;
  blurb: string;
  count: number;
  entities: Entity[];
}) {
  return (
    <section className="reg-card">
      <div className="reg-card-head">
        <div>
          <div className="reg-desk">Desk</div>
          <h3 className="reg-title">{title}</h3>
          <p className="reg-blurb">{blurb}</p>
        </div>
        <div className="reg-count">
          <span className="reg-num">{count.toLocaleString("en-IN")}</span>
          <span className="reg-num-l">Registered</span>
        </div>
      </div>
      <div className="reg-lines">
        {entities.slice(0, 4).map((e) => (
          <RegLine key={e.id} e={e} />
        ))}
      </div>
      <Link className="reg-full" href={`/desk/${slug}`}>
        Full {title} register →
      </Link>
    </section>
  );
}

export default async function FrontPage() {
  const [{ counts, total }, changes, circ, regs, news, brokers, fmes, insurance, fintech, banking, bullion] =
    await Promise.all([
      getCounts(),
      getRecentChanges(60),
      getDeskPublications("Circulars", 7),
      getDeskPublications("Regulations", 5),
      getDeskPublications("News", 4),
      getDeskEntities("Brokers", 4),
      getDeskEntities("FMEs", 4),
      getDeskEntities("Insurance", 4),
      getDeskEntities("Fintech", 4),
      getDeskEntities("Banking", 4),
      getCategoryCard(["Qualified Jewellers", "Metals & Commodities entities"], 4),
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

  // ---- Lead: real news — marquee registrations, the count, regulatory action ----
  const lead = buildLead(changes, regs, total);
  const latestDate = changes[0]?.occurred_on || null;

  // Right rail: the latest featured filings (circulars, regulations, press).
  const docsAll = [...circ, ...regs, ...news]
    .filter((p) => p.publish_date)
    .sort((a, b) => (a.publish_date! < b.publish_date! ? 1 : -1));
  const railStories = docsAll.slice(0, 4);

  // "Latest Updates": one reverse-chronological feed of everything new —
  // registrations, filings, UAC approvals, surrenders — straight from the change
  // log, de-duplicated and skipping items already featured in the rail.
  const railTitles = new Set(railStories.map((p) => p.title));
  const seenRows = new Set<string>();
  const wire = (changes as Row[]).filter((c) => {
    const h = cleanHeadline(c);
    if (!h || seenRows.has(h) || railTitles.has(h)) return false;
    seenRows.add(h);
    return true;
  }).slice(0, 14);

  // Two framed photos, matched to each story's theme (not a loose keyword).
  const [leadHero, railHero] = await Promise.all([
    getHeroImage(lead.imgTheme),
    getHeroImage(themeForDesk(railStories[0]?.desk)),
  ]);

  return (
    <>
      <h1 className="sr-only">
        GIFT City Times — GIFT IFSC entity registry, circulars, tenders and daily updates
      </h1>

      {/* ---- News & Circulars: lead + rail ---- */}
      <section className="edition">
        <div className="edition-head">
          <span>Front Page</span>
          <span>Today’s dispatches from GIFT IFSC</span>
        </div>
        <h2 className="edition-title">News &amp; Circulars</h2>

        <div className="frontgrid">
          {/* Lead story */}
          <div className="lead-col">
            <div className="kicker kicker-accent">{lead.kicker}</div>
            <h3 className="lead-hl">{lead.headline}</h3>
            <p className="standfirst">{lead.standfirst}</p>
            <div className="byline">By the Markets Desk · {shortDate(latestDate)}</div>

            {leadHero && (
              <figure className="lead-fig">
                <div className="frame tall">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="duotone" src={leadHero.url} alt={leadHero.title} loading="eager" />
                </div>
                <figcaption className="fig-cap">
                  {leadHero.creator ? `Photo: ${leadHero.creator} · ` : ""}
                  {leadHero.source}
                </figcaption>
              </figure>
            )}
          </div>

          {/* Right rail — featured filings */}
          <div className="rail-col">
            {railHero && (
              <figure className="rail-fig">
                <div className="frame rail">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="duotone" src={railHero.url} alt={railHero.title} loading="lazy" />
                </div>
                <figcaption className="fig-cap">
                  {railHero.creator ? `Photo: ${railHero.creator} · ` : ""}
                  {railHero.source}
                </figcaption>
              </figure>
            )}
            {railStories.map((p, i) => {
              const dh = docHref(p.file_url);
              const kick = p.desk || (p.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : "Notice");
              const inner = (
                <>
                  <div className="kicker kicker-accent">{kick}</div>
                  <h3 className="rail-hl">{p.title}</h3>
                  <div className="byline">{fmtDate(p.publish_date)}</div>
                </>
              );
              const cls = `rail-item${i === 0 ? " first" : ""}`;
              return dh ? (
                <a key={p.id} className={cls} href={dh} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <div key={p.id} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Latest updates (live activity feed) ---- */}
      <section className="latest-docs">
        <div className="edition-head">
          <span>Latest Updates</span>
          <span>New registrations, filings and UAC approvals, newest first</span>
        </div>
        {wire.length === 0 ? (
          <p className="empty">Quiet on the wire. New activity appears here the moment IFSCA posts it.</p>
        ) : (
          <div className="doc-list">
            {wire.map((c) => (
              <WireRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      {/* ---- The Register ---- */}
      <section className="register">
        <div className="edition-head">
          <span>The Register</span>
          <span>{total.toLocaleString("en-IN")} entities licensed across GIFT IFSC</span>
        </div>
        <div className="reg-grid">
          <RegisterCard title="Brokers" slug="brokers" blurb="Broker-dealers, distributors and global access providers." count={counts.Brokers} entities={brokers} />
          <RegisterCard title="FMEs" slug="fmes" blurb="Registered FMEs, AIFs and retail schemes domiciled in the IFSC." count={counts.FMEs} entities={fmes} />
          <RegisterCard title="Bullion & Jewellers" slug="other" blurb="Qualified jewellers, bullion houses and metal traders at IIBX." count={bullion.count} entities={bullion.entities} />
          <RegisterCard title="Banking" slug="banking" blurb="IFSC Banking Units, finance companies and payment providers." count={counts.Banking} entities={banking} />
          <RegisterCard title="Insurance" slug="insurance" blurb="IFSC insurance offices and registered intermediaries." count={counts.Insurance} entities={insurance} />
          <RegisterCard title="Fintech" slug="fintech" blurb="Entities in the IFSCA regulatory and innovation sandbox." count={counts.Fintech} entities={fintech} />
        </div>
      </section>

      {/* ---- The 6 a.m. edition ---- */}
      <section className="edition-subscribe">
        <div>
          <div className="sb-kicker">The 6 a.m. edition</div>
          <h2>Every new licence, circular and approval in GIFT IFSC.</h2>
          <p>One email each morning, sorted by desk, the moment IFSCA publishes it.</p>
          <div className="sb-note">No spam. Unsubscribe anytime.</div>
        </div>
        <div>
          <Subscribe variant="dark" />
        </div>
      </section>
    </>
  );
}
