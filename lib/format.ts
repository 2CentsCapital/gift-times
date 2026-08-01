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
  { slug: "tenders", label: "Tenders", blurb: "Tenders & procurement" },
  { slug: "sez", label: "SEZ Approvals", blurb: "UAC meetings & approvals" },
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
  tenders: "Tenders",
  sez: "SEZ Approvals",
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

// Colours for the SEZ/UAC meeting status pill.
export function sezStatusColors(status?: string | null): { color: string; bg: string } {
  switch (status) {
    case "Minutes Out":
      return { color: "#2f6b34", bg: "#e7f0e5" };
    case "Held":
      return { color: "#8a5a12", bg: "#f5ecd9" };
    case "Scheduled":
      return { color: "#1f4e7a", bg: "#e3edf5" };
    default:
      return { color: "var(--muted)", bg: "transparent" };
  }
}

export function longDate(d = new Date()): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
