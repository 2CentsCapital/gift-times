// Builds the front-page lead as NEWS, not a vanity counter.
//
// Priority: (1) a fresh regulatory action, (2) the marquee new registrations —
// named big firms + how many joined, (3) a routine-week summary. The standfirst
// carries the supporting detail (the mix, surrenders, UAC meetings).

import type { Change, Publication } from "./queries";

export type Lead = {
  kicker: string;
  headline: string;
  standfirst: string;
  imgTheme: string; // semantic theme for the hero image (see lib/heroImage.ts)
};

// What kind of imagery fits a registrations story about this segment?
function themeForCategory(cat: string | null): string {
  const k = (cat || "").toLowerCase();
  if (/jewel|bullion|metal|commodit/.test(k)) return "bullion";
  if (/fintech|sandbox/.test(k)) return "fintech";
  // Banks, funds, brokers, insurers, etc. registering = firms setting up at
  // GIFT City → the city and its offices, never a market chart.
  return "newfirms";
}

const DAY = 86400000;

// Recognisable corporate/brand names — if a new entity carries one, it's news.
const BRANDS = [
  "sun pharma", "bajaj", "jio", "reliance", "tata", "adani", "aditya birla", "mahindra",
  "hdfc", "icici", "sbi", "state bank", "axis", "kotak", "pnb", "yes ", "kedaara", "motilal",
  "blackrock", "goldman", "morgan", "jpmorgan", "hsbc", "citi", "barclays", "nomura", "ubs",
  "deutsche", "bnp", "standard chartered", "blackstone", "kkr", "carlyle", "temasek", "brookfield",
  "wells fargo", "nuvama", "edelweiss", "360 one", "avendus", "iifl", "angel one", "groww",
  "moody", "fitch", "s&p global", "allianz", "prudential", "metlife", "vanguard", "fidelity",
  "schroders", "amundi", "pimco", "invesco", "franklin templeton", "mizuho", "mufg", "sumitomo",
  "macquarie", "apollo global", "general atlantic", "warburg pincus", "santander", "natixis",
  "credit agricole", "societe generale", "dws",
];
// Generic financial descriptors — a weaker signal of significance.
const FINANCE_WORDS = [
  "bank", "insurance", "reinsurance", "securities", "capital", "asset manage", "treasury",
  "ventures", "partners", "holding", "exchange", "pension", "mutual", "life", "pharma",
];
// Category → significance tier (jewellers/metals are routine; banks/funds are marquee).
const CAT_TIER: Record<string, number> = {
  Banking: 3, "Finance Company": 3, "Market Infrastructure Institutions": 3, "Fund Management": 3,
  "Payment Service Provider": 2, "Payment System Provider": 2, "Capital Market Intermediaries": 2,
  "IFSC Insurance Office (IIO)": 2, "IFSC Insurance Intermediary Office (IIIO)": 2,
  "Fintech Sandbox Entities": 2, "Global In-House Centres": 2, "BATF Service Providers": 1,
  "Qualified Jewellers": 0, "Metals & Commodities entities": 0,
};

function cleanName(h?: string | null): string {
  return (h || "").replace(/^new\s+[^:]*:\s*/i, "").trim();
}

// Trim corporate boilerplate for a punchy headline name.
function shortName(name: string): string {
  let t = name
    .replace(/\s*\(IFSC[^)]*\)/gi, "")
    .replace(/\bGlobal Treasury Centre\b/gi, "")
    .replace(/\bIFSC\b/g, "")
    .replace(/\b(Private Limited|Pvt\.?\s*Ltd\.?|Pte\.?\s*Ltd\.?|Pte\.?|Limited|Ltd\.?|LLP|Inc\.?|Co\.?|Branch)\b/gi, "")
    .replace(/[,.\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Title-case names that arrive ALL CAPS (common in IFSCA data).
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return t || name;
}

function notability(name: string, category?: string | null): number {
  const low = name.toLowerCase();
  let s: number = category ? CAT_TIER[category] ?? 1 : 1;
  if (BRANDS.some((b) => low.includes(b))) s += 3;
  if (FINANCE_WORDS.some((w) => low.includes(w))) s += 1;
  return s;
}

function andList(items: string[]): string {
  const a = items.filter(Boolean);
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
}

function catPhrase(category: string | null, n: number): string {
  const plural = n !== 1;
  const map: Record<string, [string, string]> = {
    "Qualified Jewellers": ["qualified jeweller", "qualified jewellers"],
    "Metals & Commodities entities": ["bullion trader", "bullion traders"],
    "Fund Management": ["fund manager", "fund managers"],
    "Capital Market Intermediaries": ["broker-dealer", "broker-dealers"],
    "Finance Company": ["finance company", "finance companies"],
    Banking: ["banking unit", "banking units"],
    "IFSC Insurance Office (IIO)": ["insurer", "insurers"],
    "IFSC Insurance Intermediary Office (IIIO)": ["insurance intermediary", "insurance intermediaries"],
    "Fintech Sandbox Entities": ["fintech entrant", "fintech entrants"],
    "Payment Service Provider": ["payment provider", "payment providers"],
    "Global In-House Centres": ["global in-house centre", "global in-house centres"],
  };
  const pair = (category && map[category]) || ["entity", "entities"];
  return plural ? pair[1] : pair[0];
}

function withCount(n: number, phrase: string): string {
  return n === 1 ? `a ${phrase}` : `${n} ${phrase}`;
}

// "13 qualified jewellers, 3 fund managers and a finance company"
function describeMix(items: { category: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.category || "Other", (counts.get(i.category || "Other") || 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, n]) => withCount(n, catPhrase(cat, n)));
  return andList(parts);
}

// "IFSCA (ELECTRONIC TRADING PLATFORMS) REGULATIONS, 2026" -> title case, IFSCA kept.
function titleCaseTitle(t: string): string {
  const titled = t
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bIfsca\b/g, "IFSCA")
    .replace(/\bIibx\b/g, "IIBX")
    .replace(/\bKmp(s?)\b/gi, (m) => m.toUpperCase());
  // Only transform when the source was mostly uppercase (otherwise leave as-is).
  return t.replace(/[^A-Za-z]/g, "") === t.replace(/[^A-Za-z]/g, "").toUpperCase() ? titled : t;
}

export function buildLead(changes: Change[], regs: Publication[], total: number): Lead {
  const added = changes.filter((c) => c.change_type === "entity_added" && c.headline);
  const anchor = added[0]?.occurred_on ? new Date(added[0].occurred_on).getTime() : Date.now();
  const inWeek = (iso?: string | null) => !!iso && anchor - new Date(iso).getTime() <= 8 * DAY;

  const weekAdded = added.filter((c) => inWeek(c.occurred_on));
  const batch = weekAdded.length ? weekAdded : added;

  // De-duplicate and score, keeping each entrant's day so the lead can favour the
  // freshest news instead of replaying the same week-old marquee names.
  const seen = new Set<string>();
  const items = batch
    .map((c) => {
      const name = cleanName(c.headline);
      return {
        name,
        short: shortName(name),
        category: c.category,
        score: notability(name, c.category),
        day: c.occurred_on ? Math.floor(new Date(c.occurred_on).getTime() / DAY) : 0,
      };
    })
    .filter((i) => i.short && !seen.has(i.short.toLowerCase()) && seen.add(i.short.toLowerCase()));

  // Headline names come from the FRESHEST cohort only — the entrants from the most
  // recent day the register moved — ranked by significance (the most notable new
  // name leads). A marquee name from earlier in the week is never replayed: the
  // moment newer firms register, they take over the headline and the hero, so the
  // front page can't pin the same week-old name for days on end. When today's batch
  // has no big names, it simply names the day's most notable actual entrants.
  const newestDay = items.reduce((m, i) => Math.max(m, i.day), 0);
  const fresh = items.filter((i) => i.day === newestDay);
  const notable = [...fresh].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const count = batch.length;

  // The dominant category in the batch (what most of the week's entrants are).
  const domCat = (() => {
    const n: Record<string, number> = {};
    for (const i of items) if (i.category) n[i.category] = (n[i.category] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  })();

  // Secondary news in the window.
  const reg = regs.find((r) => r.kind === "regulation" && inWeek(r.publish_date));
  const removed = changes.filter((c) => c.change_type === "entity_removed" && inWeek(c.occurred_on));
  const uac = changes.find((c) => /^sez_(held|approval_out|minutes_out)/.test(c.change_type || "") && inWeek(c.occurred_on));
  const extras: string[] = [];
  if (removed.length) extras.push(`${removed.length} entit${removed.length > 1 ? "ies" : "y"} surrendered registration`);
  if (uac) {
    const ord = cleanName(uac.headline).match(/(\d+\s*(?:st|nd|rd|th))\s+UAC/i)?.[1];
    const verb = /held/.test(uac.change_type || "")
      ? "was held"
      : /approval/.test(uac.change_type || "")
        ? "cleared approvals"
        : "published minutes";
    extras.push(`${ord ? `the ${ord} ` : "a "}UAC meeting ${verb}`);
  }

  // (1) A fresh regulation is the biggest news.
  if (reg?.title) {
    return {
      kicker: "Regulatory Action",
      headline: titleCaseTitle(reg.title),
      standfirst: `IFSCA's new rulebook lands as ${withCount(count, "firm")} join${
        count === 1 ? "s" : ""
      } GIFT IFSC this week${notable.length ? `, led by ${andList(notable.slice(0, 3).map((n) => n.short))}` : ""}.`,
      imgTheme: "regulation",
    };
  }

  // (2) Marquee registrations lead — name the big firms + the count.
  if (notable.length) {
    const names = notable.slice(0, 3).map((n) => n.short);
    const headline = `${andList(names)} ${names.length > 1 ? "lead" : "leads"} ${count} new GIFT IFSC registrations`;
    const mix = describeMix(batch);
    const standfirst = `This week's entrants span ${mix}${extras.length ? `; ${andList(extras)}` : ""}.`;
    // Match the image to the firms the headline names, not the bulk.
    return { kicker: "New Registrations", headline, standfirst, imgTheme: themeForCategory(notable[0]?.category || domCat) };
  }

  // (3) Routine week — still frame it as movement, not a vanity total.
  const topCat = describeMix(batch).split(",")[0] || `${count} entities`;
  return {
    kicker: "The Register",
    headline: `${topCat.replace(/^\d+\s/, (m) => m)} join GIFT IFSC this week`.replace(/^a /, "A "),
    standfirst: `A steady week of registrations takes the IFSC to ${total.toLocaleString("en-IN")} licensed entities${
      extras.length ? `; ${andList(extras)}` : ""
    }.`,
    imgTheme: themeForCategory(domCat || batch[0]?.category || null),
  };
}
