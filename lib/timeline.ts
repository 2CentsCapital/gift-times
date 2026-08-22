import { fmtDate } from "./format";

export type TimelineEvent = { date: string; sort: number; title: string; kind: string };

// Field-level diffs between two consecutive entity versions. Each entry returns
// a human sentence (or null if unchanged) plus a dedupe `family` so the same
// real-world event isn't shown twice when it also appears in the change log.
const VERSION_DIFFS: { family: string; label: (p: any, c: any) => string | null }[] = [
  {
    family: "status",
    label: (p, c) => (p.status !== c.status ? `Status changed from ${p.status || "—"} to ${c.status || "—"}` : null),
  },
  {
    family: "person",
    label: (p, c) =>
      (p.contact_person || "") !== (c.contact_person || "")
        ? `Authorised person changed${p.contact_person ? ` from ${p.contact_person}` : ""} to ${c.contact_person || "—"}`
        : null,
  },
  {
    family: "validity",
    label: (p, c) => ((p.validity_to || "") !== (c.validity_to || "") ? `Validity updated to ${fmtDate(c.validity_to)}` : null),
  },
  {
    family: "address",
    label: (p, c) => ((p.registered_address || "") !== (c.registered_address || "") ? "Registered address updated" : null),
  },
  {
    family: "name",
    label: (p, c) => ((p.name || "") !== (c.name || "") ? `Renamed to “${c.name}”` : null),
  },
  {
    family: "category",
    label: (p, c) =>
      (p.category || "") + (p.subcategory || "") !== (c.category || "") + (c.subcategory || "")
        ? `Reclassified to ${[c.category, c.subcategory].filter(Boolean).join(" · ")}`
        : null,
  },
];

// Map a change-log row to a dedupe family so it collapses with the equivalent
// version diff on the same day.
function changeFamily(changeType: string): string | null {
  if (changeType === "entity_status_change") return "status";
  return null;
}

function toSort(d?: string | null): number {
  if (!d) return 0;
  const t = Date.parse(d.length <= 10 ? d + "T00:00:00Z" : d);
  return isNaN(t) ? 0 : t;
}

// Merge registration, field-level version history, and change-log events into
// one reverse-chronological timeline. Thin at first (history only accrues from
// the day capture began) and deepens automatically over time.
export function buildTimeline(entity: any, versions: any[], changes: any[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const seen = new Set<string>();

  const add = (date: string | null | undefined, title: string, kind: string, family?: string) => {
    if (!date) return;
    const day = date.slice(0, 10);
    const key = `${day}|${family || title.slice(0, 40).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ date: day, sort: toSort(date), title, kind });
  };

  if (entity.date_of_registration) add(entity.date_of_registration, "Registered with IFSCA", "registered");

  const asc = [...versions].sort((a, b) => toSort(a.valid_from) - toSort(b.valid_from));
  asc.forEach((v, i) => {
    if (i === 0) {
      add(v.valid_from, "First captured in the GIFT City Times archive", "archived");
      return;
    }
    const prev = asc[i - 1];
    for (const d of VERSION_DIFFS) {
      const label = d.label(prev, v);
      if (label) add(v.valid_from, label, "change", d.family);
    }
  });

  for (const c of changes) {
    add(c.occurred_on, c.headline, c.change_type, changeFamily(c.change_type) || undefined);
  }

  return events.sort((a, b) => b.sort - a.sort);
}
