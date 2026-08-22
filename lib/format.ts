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
  { slug: "reports", label: "Reports", blurb: "Studies, annual reports, bulletins" },
  { slug: "guidance", label: "Guidance", blurb: "Informal guidance" },
  { slug: "speeches", label: "Speeches", blurb: "Leadership speeches" },
  { slug: "careers", label: "Careers", blurb: "Vacancies & internships" },
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
  reports: "Reports",
  guidance: "Guidance",
  speeches: "Speeches",
  careers: "Careers",
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

// Sector colour families — colour encodes what kind of entity it is.
type Family = "markets" | "bullion" | "banking" | "insurance" | "fintech" | "services";
const FAMILY_COLOR: Record<Family, string> = {
  markets: "#7a1f1f",
  bullion: "#9a6a1a",
  banking: "#1f5a5f",
  insurance: "#6a2f5a",
  fintech: "#2f6b34",
  services: "#5a5148",
};
const CATEGORY_META: Record<string, { label: string; family: Family }> = {
  "Fund Management": { label: "Fund Management", family: "markets" },
  "Capital Market Intermediaries": { label: "Brokers & Intermediaries", family: "markets" },
  "Market Infrastructure Institutions": { label: "Market Infrastructure", family: "markets" },
  "Metals & Commodities entities": { label: "Metals & Commodities", family: "bullion" },
  "Qualified Jewellers": { label: "Qualified Jewellers", family: "bullion" },
  "BATF Service Providers": { label: "Accounting & Tax (BATF)", family: "services" },
  Banking: { label: "Banking Units", family: "banking" },
  "Finance Company": { label: "Finance Companies", family: "banking" },
  "Payment Service Provider": { label: "Payment Services", family: "banking" },
  "Payment System Provider": { label: "Payment Systems", family: "banking" },
  "IFSC Insurance Office (IIO)": { label: "Insurance Offices", family: "insurance" },
  "IFSC Insurance Intermediary Office (IIIO)": { label: "Insurance Intermediaries", family: "insurance" },
  "Fintech Sandbox Entities": { label: "Fintech Sandbox", family: "fintech" },
  "TAS Service Provider": { label: "TAS Providers", family: "services" },
  "Ancillary Service Provider": { label: "Ancillary Services", family: "services" },
  "Global In-House Centres": { label: "Global In-House Centres", family: "services" },
  "Foreign Universities": { label: "Foreign Universities", family: "services" },
  "KYC Registration Agency": { label: "KYC Agencies", family: "services" },
};

export function categoryMeta(category: string): { label: string; color: string } {
  const m = CATEGORY_META[category];
  const family: Family = m?.family || "services";
  return { label: m?.label || category, color: FAMILY_COLOR[family] };
}

export const FAMILY_LEGEND: { label: string; color: string }[] = [
  { label: "Capital Markets & Funds", color: FAMILY_COLOR.markets },
  { label: "Bullion & Commodities", color: FAMILY_COLOR.bullion },
  { label: "Banking & Payments", color: FAMILY_COLOR.banking },
  { label: "Insurance", color: FAMILY_COLOR.insurance },
  { label: "Fintech", color: FAMILY_COLOR.fintech },
  { label: "Enablers & Services", color: FAMILY_COLOR.services },
];

// Per-desk accent so section headers carry colour, not just maroon.
const DESK_COLOR: Record<string, string> = {
  Brokers: "#7a1f1f",
  FMEs: "#7a1f1f",
  Insurance: "#6a2f5a",
  Fintech: "#2f6b34",
  Banking: "#1f5a5f",
  Circulars: "#3a4a7a",
  Regulations: "#6b2f4a",
  News: "#7a1f1f",
  Tenders: "#5a5028",
  Reports: "#2f5a6b",
  Speeches: "#6b4a2f",
  Careers: "#4a4a52",
  Guidance: "#5c3a7a",
  Consultations: "#5a5a2f",
  "SEZ Approvals": "#7a3f1f",
};
export function deskColor(desk?: string | null): string {
  return (desk && DESK_COLOR[desk]) || "#7a1f1f";
}

// "NEW" if the date is within the last `days` days.
export function isRecent(iso?: string | null, days = 7): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  if (isNaN(d)) return false;
  return Date.now() - d < days * 86400 * 1000;
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

// Reject IFSCA placeholder / junk contact names so they do not create spurious
// "connections" (e.g. dozens of entities all listing "-" or "NA").
export function isRealPersonName(n?: string | null): boolean {
  const t = (n || "").trim();
  if (t.length < 3) return false;
  if (!/[A-Za-z]{2,}/.test(t)) return false; // must contain real letters
  const low = t.toLowerCase().replace(/[.\\s/]/g, "");
  return !["na", "nil", "none", "notavailable", "notapplicable"].includes(low) && low !== "";
}
