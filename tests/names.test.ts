import { describe, it, expect } from "vitest";
import { displayName, shortName, firmKey, groupByFirm } from "../lib/names";

describe("displayName", () => {
  it("calms the shouting without flattening acronyms", () => {
    expect(displayName("HDFC SECURITIES IFSC LIMITED")).toBe("HDFC Securities IFSC Limited");
    expect(displayName("SWETARK GLOBAL WEALTH (IFSC) PRIVATE LIMITED")).toBe(
      "Swetark Global Wealth (IFSC) Private Limited"
    );
    expect(displayName("KOTAK MAHINDRA BANK (IBU)")).toBe("Kotak Mahindra Bank (IBU)");
    expect(displayName("STATE BANK OF INDIA IBU")).toBe("State Bank of India IBU");
  });

  it("leaves well-typed names alone", () => {
    expect(displayName("Kotak India Flexicap Fund IFSC")).toBe("Kotak India Flexicap Fund IFSC");
    expect(displayName("Aivot Growth Advisory LLP")).toBe("Aivot Growth Advisory LLP");
  });

  it("keeps hyphenated and possessive words intact", () => {
    expect(displayName("HDFC INDIA MID-CAP OPPORTUNITIES FUND")).toBe(
      "HDFC India Mid-Cap Opportunities Fund"
    );
  });

  it("respects house styling that plain title case would flatten", () => {
    expect(displayName("360 ONE PORTFOLIO MANAGERS LIMITED")).toBe("360 ONE Portfolio Managers Limited");
  });
});

describe("shortName", () => {
  it("drops the legal boilerplate for dense lists", () => {
    expect(shortName("HDFC AMC International (IFSC) Limited")).toBe("HDFC AMC International");
    expect(shortName("Appreciate Broking IFSC Private Limited")).toBe("Appreciate Broking IFSC");
    expect(shortName("360 ONE Portfolio Managers Limited (IFSC Branch)")).toBe("360 ONE Portfolio Managers");
  });

  it("drops a 'formerly known as' tail", () => {
    expect(
      shortName("Aon Risk Insurance Brokers India Private Limited (formerly known as Global Insurance Brokers Private Limited)")
    ).toBe("Aon Risk Insurance Brokers India");
  });

  it("never returns an empty string", () => {
    // Everything here is boilerplate; fall back to the full name.
    expect(shortName("Private Limited")).toBeTruthy();
  });
});

describe("firmKey", () => {
  it("folds every ICICI Bank spelling onto one key", () => {
    const spellings = [
      "ICICI Bank",
      "ICICI Bank IBU",
      "ICICI Bank, IBU",
      "ICICI BANK LIMITED (IBU)",
      "ICICI BANK LIMITED IBU",
    ];
    expect(new Set(spellings.map(firmKey)).size).toBe(1);
  });

  it("folds case and legal-suffix variants of the same firm", () => {
    expect(firmKey("Phillip Ventures IFSC Private Limited")).toBe(
      firmKey("PHILLIP VENTURES IFSC PRIVATE LIMITED")
    );
    expect(firmKey("Phillip Ventures IFSC Pvt Ltd")).toBe(firmKey("Phillip Ventures IFSC Private Limited"));
  });

  it("keeps genuinely different firms apart", () => {
    expect(firmKey("Abans Global Limited")).not.toBe(firmKey("Abans Global Broking (IFSC) Private Limited"));
    expect(firmKey("HDFC India Nifty 50 Fund")).not.toBe(firmKey("HDFC India Small Cap Fund"));
  });
});

describe("groupByFirm", () => {
  it("folds a firm's licences into one entry with a count", () => {
    const rows = [
      { name: "State Bank of India" },
      { name: "STATE BANK OF INDIA IBU" },
      { name: "State Bank of India (IBU)" },
      { name: "State Bank of India IFSC Banking Unit" },
      { name: "IDBI Bank" },
    ];
    const grouped = groupByFirm(rows);
    expect(grouped).toHaveLength(2);
    const sbi = grouped.find((g) => g.short.startsWith("State Bank"))!;
    expect(sbi.licences).toBe(4);
    // The tidiest spelling wins, not the shoutiest.
    expect(sbi.name).not.toBe("STATE BANK OF INDIA IBU");
  });

  it("prefers a mixed-case spelling over an all-caps one", () => {
    const grouped = groupByFirm([
      { name: "STOCKHOLDING SECURITIES IFSC LIMITED" },
      { name: "StockHolding Securities IFSC Limited" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].name).toBe("StockHolding Securities IFSC Limited");
  });

  it("sorts alphabetically by the displayed name", () => {
    const grouped = groupByFirm([{ name: "Zeta Fund" }, { name: "Alpha Fund" }, { name: "Mid Fund" }]);
    expect(grouped.map((g) => g.short)).toEqual(["Alpha Fund", "Mid Fund", "Zeta Fund"]);
  });
});
