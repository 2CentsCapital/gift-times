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
import { fmtDate } from "@/lib/format";
import { docHref } from "@/lib/doc";
import { getHeroImage } from "@/lib/heroImage";
import Subscribe from "@/components/Subscribe";

export const revalidate = 900; // ISR: refresh every 15 min (ingest is twice daily)

// Change headlines are prefixed ("New registered entity: X", "New broker …: X").
// Strip the prefix so we show the clean name in an editorial context.
function cleanHeadline(h?: string | null): string {
  const t = (h || "").trim();
  return t.replace(/^new\s+[^:]*:\s*/i, "").trim() || t;
}

// ---- Editorial lead: build a sentence headline + italic standfirst from the
// day's real additions, in the reference's broadsheet voice. ----

function dominantCategory(changes: Change[]): string | null {
  const n: Record<string, number> = {};
  for (const c of changes) if (c.category) n[c.category] = (n[c.category] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

function leadPhrase(cat: string | null): string {
  const k = (cat || "").toLowerCase();
  if (/jewel|bullion|metal|commodit/.test(k)) return "as jewellers and bullion houses pour in";
  if (/broker|capital market|intermediar/.test(k)) return "as brokers and intermediaries line up";
  if (/fund|aif/.test(k)) return "as fund managers pile in";
  if (/bank|finance|payment/.test(k)) return "as banks and finance firms expand";
  if (/insur/.test(k)) return "as insurers set up shop";
  if (/fintech|sandbox/.test(k)) return "as fintech entrants join the sandbox";
  return "";
}

function catDescriptor(cat: string | null): string {
  const k = (cat || "").toLowerCase();
  if (/jewel/.test(k)) return "qualified jewellers, bullion traders and metal recyclers";
  if (/metal|bullion|commodit/.test(k)) return "bullion traders, metal recyclers and qualified jewellers";
  if (/broker|capital market|intermediar/.test(k)) return "broker-dealers and market intermediaries";
  if (/fund|aif/.test(k)) return "fund managers and alternative investment funds";
  if (/bank|finance|payment/.test(k)) return "banking units and finance companies";
  if (/insur/.test(k)) return "insurance offices and intermediaries";
  if (/fintech|sandbox/.test(k)) return "fintech entrants";
  return "newly licensed entities";
}

function andList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

function shortDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .toUpperCase();
}

// A dated document row in "Latest from the Registry".
function DocRow({ p }: { p: Publication }) {
  const dh = docHref(p.file_url);
  // Prefer a single, singular kind label ("Circular"), falling back to the desk.
  const tag = p.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : p.desk || "";
  const body = (
    <>
      <span className="doc-date">{fmtDate(p.publish_date)}</span>
      <span className="doc-title">{p.title}</span>
      <span className="doc-tag">{tag}</span>
    </>
  );
  return dh ? (
    <a className="doc-row" href={dh} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="doc-row">{body}</div>
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
      getRecentChanges(8),
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

  // ---- Lead: an editorial milestone drawn from the day's real additions ----
  const domCat = dominantCategory(changes);
  const phrase = leadPhrase(domCat);
  const leadHeadline = `GIFT IFSC register crosses ${total.toLocaleString("en-IN")} entities${
    phrase ? " " + phrase : ""
  }`;

  const latestDate = changes[0]?.occurred_on || null;
  const dateWord = latestDate
    ? new Date(latestDate).toLocaleDateString("en-IN", { day: "numeric", month: "long" })
    : "";
  const otherNames = changes
    .filter((c) => c.category !== domCat)
    .map((c) => cleanHeadline(c.headline))
    .filter(Boolean)
    .slice(0, 2);
  const leadStandfirst = domCat
    ? `A fresh wave of ${catDescriptor(domCat)} joined the register${dateWord ? " on " + dateWord : ""}${
        otherNames.length ? ", alongside " + andList(otherNames) : ""
      }.`
    : "New licences, circulars and approvals across GIFT IFSC — updated twice daily from IFSCA.";

  // Latest documents: circulars, regulations and press, newest first.
  const docsAll = [...circ, ...regs, ...news]
    .filter((p) => p.publish_date)
    .sort((a, b) => (a.publish_date! < b.publish_date! ? 1 : -1));
  const railStories = docsAll.slice(0, 4);
  const docs = docsAll.slice(4, 12);

  // Two framed photos: the lead (matched to the day's dominant segment) and the rail.
  const [leadHero, railHero] = await Promise.all([
    getHeroImage(undefined, domCat || "Qualified Jewellers"),
    getHeroImage(railStories[0]?.desk || "Regulations", null),
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
            <div className="kicker kicker-accent">Lead Story</div>
            <h3 className="lead-hl">{leadHeadline}</h3>
            <p className="standfirst">{leadStandfirst}</p>
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

      {/* ---- Latest documents ---- */}
      <section className="latest-docs">
        <div className="edition-head">
          <span>Latest from the Registry</span>
          <Link href="/desk/circulars" className="view-all">
            View all →
          </Link>
        </div>
        {docs.length === 0 ? (
          <p className="empty">Quiet on the wire. New filings appear here the moment IFSCA posts them.</p>
        ) : (
          <div className="doc-list">
            {docs.map((p) => (
              <DocRow key={p.id} p={p} />
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
          <p>One email at 6am and 4pm, sorted by desk — the moment IFSCA publishes it.</p>
          <div className="sb-note">No spam. Unsubscribe anytime.</div>
        </div>
        <div>
          <Subscribe variant="dark" />
        </div>
      </section>
    </>
  );
}
