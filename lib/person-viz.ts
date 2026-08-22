import { categoryMeta, FAMILY_LEGEND } from "./format";

// Pure layout engine for the person "Path across GIFT City" timeline.
// Places each entity as a node on a horizontal time axis (by registration date),
// stacking entities that share a date. Everything is computed server-side so the
// page renders as static inline SVG — no client JS, works under the strict CSP.

export type VizEntity = {
  id: string;
  name: string;
  desk: string | null;
  status: string | null;
  category: string | null;
  subcategory: string | null;
  date_of_registration: string | null;
};

export type VizNode = VizEntity & { num: number; color: string; dated: boolean; x?: number; y?: number };

export type PathViz = {
  hasChart: boolean;
  width: number;
  height: number;
  axisY: number;
  padL: number;
  padR: number;
  r: number;
  nodes: VizNode[]; // positioned (dated) nodes for the SVG
  stems: { x: number; yTop: number }[];
  dateLabels: { x: number; label: string }[];
  list: VizNode[]; // full ordered index (dated first, then undated), numbered 1..N
  families: { label: string; color: string }[];
};

function parseT(d?: string | null): number | null {
  if (!d) return null;
  const t = Date.parse(d.length <= 10 ? d + "T00:00:00Z" : d);
  return isNaN(t) ? null : t;
}

function shortDate(d: string): string {
  const dt = new Date((d.length <= 10 ? d : d.slice(0, 10)) + "T00:00:00Z");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
}

export function buildPathTimeline(entities: VizEntity[]): PathViz {
  const W = 760;
  const padL = 40;
  const padR = 40;
  const r = 8;
  const stemStep = 30;
  const baseStem = 30;
  const topPad = 18;
  const bottomPad = 58;

  const withColor = entities.map((e) => ({ ...e, color: categoryMeta(e.category || "").color }));
  const dated = withColor
    .map((e) => ({ e, t: parseT(e.date_of_registration) }))
    .filter((x): x is { e: (typeof withColor)[number]; t: number } => x.t != null)
    .sort((a, b) => a.t - b.t);
  const undated = withColor.filter((e) => parseT(e.date_of_registration) == null);

  // Chronological numbering across the whole footprint (dated first, then undated).
  const ordered: VizNode[] = [
    ...dated.map((x) => ({ ...x.e, dated: true, num: 0 })),
    ...undated.map((e) => ({ ...e, dated: false, num: 0 })),
  ];
  ordered.forEach((n, i) => (n.num = i + 1));

  const families = FAMILY_LEGEND.filter((f) => withColor.some((e) => e.color === f.color));

  if (!dated.length) {
    return { hasChart: false, width: W, height: 0, axisY: 0, padL, padR, r, nodes: [], stems: [], dateLabels: [], list: ordered, families };
  }

  const min = dated[0].t;
  const max = dated[dated.length - 1].t;
  const span = max - min;
  const xOf = (t: number) => (span === 0 ? padL + (W - padL - padR) / 2 : padL + ((t - min) / span) * (W - padL - padR));

  // Group consecutive same-date entities; stack them vertically at that x.
  const stems: { x: number; yTop: number }[] = [];
  const dateLabels: { x: number; label: string }[] = [];
  const nodes: VizNode[] = [];
  const byDate = new Map<string, { e: (typeof dated)[number]["e"]; }[]>();
  for (const d of dated) {
    const key = (d.e.date_of_registration as string).slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push({ e: d.e });
  }

  let maxStack = 1;
  for (const group of byDate.values()) maxStack = Math.max(maxStack, group.length);
  const height = bottomPad + baseStem + (maxStack - 1) * stemStep + r + topPad;
  const axisY = height - bottomPad;

  const numFor = new Map(ordered.map((n) => [n.id, n.num]));
  for (const [dateKey, group] of byDate) {
    const t = parseT(dateKey)!;
    const x = xOf(t);
    let yTop = axisY;
    group.forEach((g, i) => {
      const y = axisY - baseStem - i * stemStep;
      yTop = y;
      nodes.push({ ...g.e, dated: true, num: numFor.get(g.e.id) || 0, x, y });
    });
    stems.push({ x, yTop });
    dateLabels.push({ x, label: shortDate(dateKey) });
  }

  return { hasChart: true, width: W, height, axisY, padL, padR, r, nodes, stems, dateLabels, list: ordered, families };
}
