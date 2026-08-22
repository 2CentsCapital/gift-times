import { describe, it, expect } from "vitest";
import { hashOf, computeVersionPlan, TRACKED } from "../scripts/lib/history.mjs";

const NOW = "2026-08-22T00:00:00.000Z";

function entity(over = {}) {
  return {
    id: "e1",
    encrypted_id: "ENC1",
    first_seen: "2026-01-01T00:00:00.000Z",
    name: "Acme Fund Ltd",
    category: "Fund Management",
    subcategory: "Non-Retail",
    registration_number: "IFSCA/FME/1",
    date_of_registration: "2025-05-01",
    validity_to: "2027-05-01",
    registered_address: "Unit 1, GIFT City",
    contact_person: "A. Rao",
    email: "a@acme.com",
    website: "acme.com",
    remarks: null,
    status: "Active",
    desk: "FMEs",
    is_active: true,
    ...over,
  };
}

describe("hashOf", () => {
  it("is stable and ignores untracked fields", () => {
    const a = entity();
    const b = entity({ id: "different", first_seen: "2020-01-01" }); // untracked
    expect(hashOf(a)).toBe(hashOf(b));
  });
  it("changes when any tracked field changes", () => {
    for (const f of TRACKED) {
      const base = entity();
      const changed = entity({ [f]: base[f] === "changed" ? "other" : "changed" });
      expect(hashOf(changed)).not.toBe(hashOf(base));
    }
  });
});

describe("computeVersionPlan", () => {
  it("creates a first version for an entity with no open version", () => {
    const { toInsert, toCloseIds } = computeVersionPlan([entity()], new Map(), NOW);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].first_version).toBe(true);
    expect(toInsert[0].valid_to).toBeNull();
    expect(toCloseIds).toHaveLength(0);
  });

  it("writes nothing when the open version matches (idempotent)", () => {
    const e = entity();
    const open = new Map([[e.id, { id: 99, content_hash: hashOf(e) }]]);
    const { toInsert, toCloseIds } = computeVersionPlan([e], open, NOW);
    expect(toInsert).toHaveLength(0);
    expect(toCloseIds).toHaveLength(0);
  });

  it("closes the old version and opens a new one when a field changes", () => {
    const before = entity();
    const open = new Map([[before.id, { id: 99, content_hash: hashOf(before) }]]);
    const after = entity({ status: "Surrendered/Cancelled" });
    const { toInsert, toCloseIds } = computeVersionPlan([after], open, NOW);
    expect(toCloseIds).toEqual([99]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].first_version).toBe(false);
    expect(toInsert[0].status).toBe("Surrendered/Cancelled");
    expect(toInsert[0].data.status).toBe("Surrendered/Cancelled");
  });
});
