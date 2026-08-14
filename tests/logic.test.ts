import { describe, it, expect } from "vitest";
import { categoryMeta, deskColor, isRecent, fmtDate, DESK_BY_SLUG } from "@/lib/format";
import { isIfscaDoc, docHref } from "@/lib/doc";
import { makeToken, verifyToken } from "@/lib/token";

describe("categoryMeta", () => {
  it("classifies BATF as a service, not bullion (the reported bug)", () => {
    const m = categoryMeta("BATF Service Providers");
    expect(m.label).toBe("Accounting & Tax (BATF)");
    expect(m.color).toBe("#5a5148"); // services family
  });
  it("classifies Metals & Commodities as bullion", () => {
    expect(categoryMeta("Metals & Commodities entities").color).toBe("#9a6a1a");
  });
  it("falls back safely for an unknown category", () => {
    const m = categoryMeta("Some New IFSCA Category");
    expect(m.label).toBe("Some New IFSCA Category");
    expect(m.color).toBe("#5a5148"); // default services family
  });
});

describe("deskColor / slugs", () => {
  it("maps known desks to colours and unknown to the accent", () => {
    expect(deskColor("Brokers")).toBe("#7a1f1f");
    expect(deskColor("Insurance")).toBe("#6a2f5a");
    expect(deskColor(null)).toBe("#7a1f1f");
  });
  it("maps slugs to desk names", () => {
    expect(DESK_BY_SLUG["sez"]).toBe("SEZ Approvals");
    expect(DESK_BY_SLUG["fmes"]).toBe("FMEs");
  });
});

describe("isRecent", () => {
  it("is true within the window, false outside, false for null", () => {
    expect(isRecent(new Date().toISOString(), 7)).toBe(true);
    expect(isRecent("2000-01-01", 7)).toBe(false);
    expect(isRecent(null)).toBe(false);
    expect(isRecent("not-a-date")).toBe(false);
  });
});

describe("fmtDate", () => {
  it("formats ISO dates and tolerates junk", () => {
    expect(fmtDate("2026-08-06")).toMatch(/2026/);
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("garbage")).toBe("");
  });
});

describe("doc mirror routing", () => {
  const ifscaUrl = "https://ifsca.gov.in/CommonDirect/ViewFile?id=abc&fileName=x.pdf";
  it("detects IFSCA ViewFile docs", () => {
    expect(isIfscaDoc(ifscaUrl)).toBe(true);
    expect(isIfscaDoc("https://example.com/x.pdf")).toBe(false);
    expect(isIfscaDoc(null)).toBe(false);
  });
  it("routes IFSCA docs through /d and passes others through", () => {
    expect(docHref(ifscaUrl)).toBe(`/d?u=${encodeURIComponent(ifscaUrl)}`);
    expect(docHref("/entity/123")).toBe("/entity/123");
    expect(docHref(null)).toBeUndefined();
  });
});

describe("signed tokens", () => {
  it("round-trips and rejects forgeries / wrong action", () => {
    const t = makeToken("unsub", "User@Example.com");
    expect(verifyToken("unsub", "user@example.com", t)).toBe(true); // case-insensitive
    expect(verifyToken("unsub", "user@example.com", t + "x")).toBe(false);
    expect(verifyToken("confirm", "user@example.com", t)).toBe(false); // action-scoped
    expect(verifyToken("unsub", "other@example.com", t)).toBe(false);
    expect(verifyToken("unsub", "user@example.com", "")).toBe(false);
  });
});
