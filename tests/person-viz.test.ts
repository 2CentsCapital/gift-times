import { describe, it, expect } from "vitest";
import { buildPathTimeline } from "../lib/person-viz";

const E = (id: string, date: string | null, category = "Fund Management") => ({
  id,
  name: id,
  desk: "FMEs",
  status: "Active",
  category,
  subcategory: null,
  date_of_registration: date,
});

describe("buildPathTimeline", () => {
  it("returns no chart when nothing is dated, but still lists everything", () => {
    const v = buildPathTimeline([E("a", null)]);
    expect(v.hasChart).toBe(false);
    expect(v.list).toHaveLength(1);
    expect(v.list[0].num).toBe(1);
  });

  it("numbers chronologically and positions dated nodes left→right by date", () => {
    const v = buildPathTimeline([E("late", "2025-01-01"), E("early", "2024-01-01")]);
    expect(v.hasChart).toBe(true);
    expect(v.list.find((n) => n.id === "early")!.num).toBe(1);
    expect(v.list.find((n) => n.id === "late")!.num).toBe(2);
    const ex = v.nodes.find((n) => n.id === "early")!.x!;
    const lx = v.nodes.find((n) => n.id === "late")!.x!;
    expect(lx).toBeGreaterThan(ex);
  });

  it("stacks entities sharing a date at the same x, different y", () => {
    const v = buildPathTimeline([E("a", "2024-05-01"), E("b", "2024-05-01")]);
    const a = v.nodes.find((n) => n.id === "a")!;
    const b = v.nodes.find((n) => n.id === "b")!;
    expect(a.x).toBe(b.x);
    expect(a.y).not.toBe(b.y);
  });

  it("keeps undated entities in the list (numbered last) but off the chart", () => {
    const v = buildPathTimeline([E("d", "2024-05-01"), E("u", null)]);
    expect(v.nodes.map((n) => n.id)).toEqual(["d"]);
    const u = v.list.find((n) => n.id === "u")!;
    expect(u.dated).toBe(false);
    expect(u.num).toBe(2);
  });
});
