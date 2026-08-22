// Making IFSCA's firm names readable.
//
// The register is typed by many hands over several years, so the same firm
// arrives in several spellings — ICICI Bank appears as "ICICI Bank", "ICICI
// Bank IBU", "ICICI Bank, IBU", "ICICI BANK LIMITED (IBU)" and "ICICI BANK
// LIMITED IBU" — and 177 of the 2,041 names are typed entirely in capitals.
//
// A register row is a *licence*, not a firm: a company holding three
// permissions appears three times. Printing that verbatim reads like a bug, so
// for display we title-case the shouting, shorten the legal boilerplate, and
// fold a firm's licences into one entry carrying a count.

// Tokens that must stay upper-case. Without this list "HDFC AMC" becomes
// "Hdfc Amc".
const ACRONYMS = new Set([
  "IFSC", "IFSCA", "IBU", "GIFT", "SEZ", "LLP", "LLC", "AMC", "AIF", "FME",
  "ETF", "FOF", "NBFC", "KYC", "AML", "CFT", "PMS", "REIT", "INVIT", "SPV",
  "JV", "WOS", "GP", "LP", "PE", "VC", "MF", "DP", "IT", "HR", "AI", "ESG",
  "SBI", "HDFC", "ICICI", "IDBI", "IDFC", "RBL", "PNB", "BOB", "BNP", "DBS",
  "HSBC", "UBS", "JP", "BOA", "SMBC", "MUFG", "SEBI", "RBI", "IRDAI", "MCA",
  "DGCA", "NSE", "BSE", "MSCI", "NRI", "INR", "USD", "AED", "UAE", "USA",
  "UK", "US", "EU", "CX", "ITI", "LKP", "GAO", "IIO", "IIIO", "TAS", "BATF",
  "KRA", "CRJ", "RRBP", "RRPF", "3PIM", "360", "IFC", "TRQ", "UAC", "NSDL",
  "CDSL", "AIF1", "PLC", "SA", "NV", "AG", "SE", "BV", "GMBH", "PTE", "DMCC",
]);

// Words that stay lower-case unless they lead the name.
const MINOR = new Set(["of", "and", "the", "for", "in", "on", "at", "to", "a", "an", "de", "van", "von"]);

function titleToken(tok: string, first: boolean): string {
  // Keep anything already mixed-case exactly as typed — the register's
  // better-entered rows are usually right, and "iNVESTA" style branding is
  // theirs to choose.
  const letters = tok.replace(/[^A-Za-z]/g, "");
  if (!letters) return tok;

  const bare = tok.replace(/[^A-Za-z0-9&]/g, "").toUpperCase();
  if (ACRONYMS.has(bare)) {
    // Preserve surrounding punctuation, e.g. "(IFSC)".
    return tok.replace(/[A-Za-z0-9&]+/, bare);
  }
  if (letters !== letters.toUpperCase()) return tok; // already mixed case

  const lower = tok.toLowerCase();
  if (!first && MINOR.has(lower.replace(/[^a-z]/g, ""))) return lower;
  // Capitalise the first letter of each alphabetic run, so "o'brien" and
  // "mid-cap" come out right.
  return lower.replace(/[a-z]+/g, (w, i, s) => {
    const prev = (s as string)[(i as number) - 1];
    if (prev && /[a-z]/i.test(prev)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

// A few house styles that title-casing would flatten ("360 ONE" is the brand,
// not "360 One"). Applied after the general pass.
const BRANDS: [RegExp, string][] = [
  [/\b360 One\b/g, "360 ONE"],
  [/\bIifl\b/g, "IIFL"],
  [/\bJm Financial\b/g, "JM Financial"],
  [/\bYes Bank\b/g, "YES Bank"],
];

/** Human-readable form of a raw register name. */
export function displayName(raw: string): string {
  const s = (raw || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  let out = s.split(" ").map((t, i) => titleToken(t, i === 0)).join(" ");
  for (const [re, to] of BRANDS) out = out.replace(re, to);
  return out;
}

/** The same name with the legal boilerplate trimmed, for dense lists. */
export function shortName(raw: string): string {
  return displayName(raw)
    .replace(/\s*\((?:formerly|erstwhile)[^)]*\)/gi, "")
    .replace(/\s*[,(-]?\s*\b(?:IFSC\s+)?(?:Banking\s+Unit|IBU)\b\s*\)?/gi, "")
    .replace(/\s*\(\s*IFSC\s*(?:Branch|Unit)?\s*\)/gi, "")
    .replace(/\s*\b(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?)\b\.?/gi, "")
    .replace(/\s*[-,]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim() || displayName(raw);
}

/**
 * Identity key for folding a firm's several licences together. Strips case,
 * legal suffixes and the IFSC/IBU markers that differ between registrations.
 */
export function firmKey(raw: string): string {
  return (raw || "")
    .toLowerCase()
    // "State Bank of India IFSC Banking Unit" and "State Bank of India (IBU)"
    // are the same bank; the licence wording is what differs.
    .replace(/\bifsc\s*banking\s*unit\b|\bbanking\s*unit\b/g, " ")
    .replace(/\(ifsc\s*(branch|unit)?\)|\bifsc\b|\bibu\b|\bgift\b/g, " ")
    .replace(/\bprivate limited\b|\bpvt\.? ?ltd\.?\b|\blimited\b|\bltd\.?\b|\bllp\b|\bllc\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Grouped<T> = {
  key: string;
  /** the tidiest spelling among the licences */
  name: string;
  short: string;
  /** how many register rows folded into this entry */
  licences: number;
  items: T[];
};

/**
 * Fold register rows into one entry per firm. The displayed spelling is the
 * least shouty, longest variant — the one a reader would recognise.
 */
export function groupByFirm<T extends { name: string }>(items: T[]): Grouped<T>[] {
  const byKey = new Map<string, T[]>();
  for (const it of items) {
    const k = firmKey(it.name) || it.name.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(it);
  }
  const out: Grouped<T>[] = [];
  for (const [key, group] of byKey) {
    const best = [...group].sort((a, b) => {
      const shout = (s: string) => {
        const l = s.replace(/[^A-Za-z]/g, "");
        return l.length > 3 && l === l.toUpperCase() ? 1 : 0;
      };
      return shout(a.name) - shout(b.name) || b.name.length - a.name.length;
    })[0];
    out.push({
      key,
      name: displayName(best.name),
      short: shortName(best.name),
      licences: group.length,
      items: group,
    });
  }
  return out.sort((a, b) => a.short.localeCompare(b.short));
}
