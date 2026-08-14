import { describe, it, expect } from "vitest";
import { toIsoDate, fileUrl } from "../scripts/lib/ifsca.mjs";
import { buildNewsletter } from "../scripts/lib/newsletter.mjs";

describe("toIsoDate", () => {
  it("parses IFSCA DD/MM/YYYY", () => {
    expect(toIsoDate("06/08/2026")).toBe("2026-08-06");
    expect(toIsoDate("31/12/2025")).toBe("2025-12-31");
  });
  it("returns null on bad input", () => {
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate("2026-08-06")).toBeNull(); // wrong format
    expect(toIsoDate(null)).toBeNull();
  });
});

describe("fileUrl", () => {
  it("builds an encoded ViewFile URL, null when missing parts", () => {
    const u = fileUrl("id123", "a b.pdf");
    expect(u).toContain("/CommonDirect/ViewFile?id=id123");
    expect(u).toContain("fileName=a%20b.pdf");
    expect(fileUrl(null, "x.pdf")).toBeNull();
    expect(fileUrl("id", null)).toBeNull();
  });
});

describe("buildNewsletter", () => {
  const changes = [
    { desk: "Circulars", headline: "New circular: X", category: "Circular", url: "https://ifsca.gov.in/CommonDirect/ViewFile?id=1&fileName=a.pdf", detail: {} },
  ];
  it("subject reflects update count vs quiet day", () => {
    expect(buildNewsletter([], "https://giftcitytimes.com", "2026-08-06").subject).toMatch(/quiet day/i);
    expect(buildNewsletter(changes, "https://giftcitytimes.com", "2026-08-06").subject).toMatch(/1 update/);
  });
  it("includes an unsubscribe link only when provided", () => {
    const withUnsub = buildNewsletter(changes, "https://giftcitytimes.com", "2026-08-06", "https://giftcitytimes.com/api/unsubscribe?e=a&t=b");
    expect(withUnsub.html).toContain("Unsubscribe");
    const without = buildNewsletter(changes, "https://giftcitytimes.com", "2026-08-06", null);
    expect(without.html).not.toContain(">Unsubscribe<");
  });
});
