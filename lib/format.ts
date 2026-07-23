export const DESKS: { slug: string; label: string; blurb: string }[] = [
  { slug: "brokers", label: "Brokers", blurb: "Capital-market intermediaries" },
  { slug: "fmes", label: "FMEs", blurb: "Fund management entities" },
  { slug: "insurance", label: "Insurance", blurb: "IIOs & intermediaries" },
  { slug: "fintech", label: "Fintech", blurb: "Sandbox & innovation" },
  { slug: "banking", label: "Banking", blurb: "Banking & finance companies" },
  { slug: "circulars", label: "Circulars", blurb: "IFSCA circulars" },
  { slug: "regulations", label: "Regulations", blurb: "Regulations & notices" },
  { slug: "news", label: "News", blurb: "Press releases" },
  { slug: "consultations", label: "Consultations", blurb: "Consultation papers" },
];

export const DESK_BY_SLUG: Record<string, string> = {
  brokers: "Brokers",
  fmes: "FMEs",
  insurance: "Insurance",
  fintech: "Fintech",
  banking: "Banking",
  circulars: "Circulars",
  regulations: "Regulations",
  news: "News",
  consultations: "Consultations",
  surrendered: "Surrendered",
  other: "Other",
};

export function deskLabel(desk: string): string {
  const found = DESKS.find((d) => d.label === desk);
  if (found) return found.label;
  if (desk === "Surrendered") return "Surrenders";
  return desk || "Other";
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function longDate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
