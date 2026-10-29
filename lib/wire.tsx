import Link from "next/link";
import { fmtDate, DESKS } from "@/lib/format";
import { docHref } from "@/lib/doc";
import type { Change } from "@/lib/queries";

// A row in the "Latest Updates" wire — one entry from the change log (a new
// registration, filing, UAC approval or surrender). Shared by the front-page
// feed and the full /updates archive.
export type Row = Change & { ref_id?: string; ref_table?: string };

export function cleanHeadline(c: Row): string {
  let h = c.headline || "";
  // Drop the "New broker / ...:" or "New circular:" prefix — the tag carries that.
  if (c.change_type === "entity_added" || c.change_type === "publication_added") {
    h = h.replace(/^new\s+[^:]*:\s*/i, "");
  }
  // Em dashes out of ingested text — a comma reads cleaner.
  return h.replace(/\s*—\s*/g, ", ").trim();
}

export function changeTag(c: Row): string {
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

export function changeLink(c: Row): { href?: string; external?: boolean } {
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

export function WireRow({ c }: { c: Row }) {
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
