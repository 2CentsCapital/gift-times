import { describe, it, expect } from "vitest";
import { buildTimeline } from "../lib/timeline";

const entity = { date_of_registration: "2025-05-01", name: "Acme Fund Ltd" };

describe("buildTimeline", () => {
  it("anchors on registration and the first archived version", () => {
    const versions = [{ valid_from: "2026-08-22T00:00:00Z", status: "Active", first_version: true }];
    const tl = buildTimeline(entity, versions, []);
    expect(tl.map((e) => e.kind)).toContain("registered");
    expect(tl.map((e) => e.kind)).toContain("archived");
    // reverse-chronological: newest (archived 2026) before registration (2025)
    expect(tl[0].kind).toBe("archived");
  });

  it("emits a field-level diff between consecutive versions", () => {
    const versions = [
      { valid_from: "2026-08-22T00:00:00Z", status: "Active", contact_person: "A. Rao", first_version: true },
      { valid_from: "2026-09-01T00:00:00Z", status: "Surrendered/Cancelled", contact_person: "A. Rao", first_version: false },
    ];
    const tl = buildTimeline(entity, versions, []);
    expect(tl.some((e) => e.title.includes("Status changed from Active to Surrendered/Cancelled"))).toBe(true);
  });

  it("dedupes a status change that appears in both a version diff and the change log", () => {
    const versions = [
      { valid_from: "2026-08-22T00:00:00Z", status: "Active", first_version: true },
      { valid_from: "2026-09-01T00:00:00Z", status: "Removed", first_version: false },
    ];
    const changes = [{ occurred_on: "2026-09-01", change_type: "entity_status_change", headline: "Registration surrendered" }];
    const tl = buildTimeline(entity, versions, changes);
    const onThatDay = tl.filter((e) => e.date === "2026-09-01");
    expect(onThatDay).toHaveLength(1); // collapsed by the shared "status" family
  });
});
