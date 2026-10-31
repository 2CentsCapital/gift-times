import { describe, it, expect } from "vitest";
import { buildLead } from "@/lib/lead";
import type { Change } from "@/lib/queries";

// Minimal entity_added change for lead tests.
function add(occurred_on: string, headline: string, category: string | null): Change {
  return {
    id: `${occurred_on}-${headline}`,
    occurred_on,
    change_type: "entity_added",
    desk: "FMEs",
    headline,
    category,
    url: null,
    detail: null,
  };
}

describe("buildLead freshness", () => {
  // The reported bug: a marquee name (360 One) that registered days ago kept
  // leading the headline every day, even as newer firms arrived.
  it("does not replay a week-old marquee name once fresher firms register", () => {
    const changes = [
      add("2026-10-31", "GSC Gold", "Qualified Jewellers"),
      add("2026-10-31", "Harman Bullion and Refinery", "Qualified Jewellers"),
      add("2026-10-26", "360 One Distribution Services", "Capital Market Intermediaries"),
    ];
    const lead = buildLead(changes, [], 1000);
    expect(lead.headline).not.toMatch(/360 One/);
    expect(lead.headline).toMatch(/GSC Gold/);
  });

  // Within the freshest day, the most notable entrant leads — a bank beats
  // the jewellers that registered the same day.
  it("leads with the most notable firm from the freshest day", () => {
    const changes = [
      add("2026-10-31", "Tiny Gems", "Qualified Jewellers"),
      add("2026-10-31", "Standard Chartered Bank", "Banking"),
      add("2026-10-31", "Small Jewels", "Qualified Jewellers"),
    ];
    const lead = buildLead(changes, [], 1000);
    expect(lead.headline).toMatch(/^Standard Chartered/);
  });

  // When the freshest day has no big names, it still names that day's actual
  // entrants rather than reaching back for an older notable one.
  it("names the freshest day's entrants even with no marquee brand", () => {
    const changes = [
      add("2026-10-31", "Shiv Enterprises", "Qualified Jewellers"),
      add("2026-10-24", "HDFC Bank", "Banking"),
    ];
    const lead = buildLead(changes, [], 1000);
    expect(lead.headline).toMatch(/Shiv Enterprises/);
    expect(lead.headline).not.toMatch(/HDFC/);
  });
});
