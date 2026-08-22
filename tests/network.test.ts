import { describe, it, expect } from "vitest";
import { buildGraph, type EntityRow, type PersonRow } from "../lib/network";

const ent = (id: string, over: Partial<EntityRow> = {}): EntityRow => ({
  id,
  name: `Entity ${id}`,
  desk: "FMEs",
  category: "Fund Management",
  status: "Active",
  registered_address: null,
  ...over,
});

const ADDR = "Unit 647, 6th Floor, Signature Building, Block 13B, GIFT SEZ, Gandhinagar";

describe("buildGraph", () => {
  it("creates a person hub only when the person signs for more than one entity", () => {
    const g = buildGraph(
      [ent("a"), ent("b"), ent("c")],
      [
        { name: "Mr. Hemant Agrawal", entity_id: "a" },
        { name: "Mr. Hemant Agrawal", entity_id: "b" },
        { name: "Ms. Solo Signatory", entity_id: "c" },
      ] as PersonRow[]
    );
    const hubs = g.nodes.filter((n) => n.kind === "person");
    expect(hubs).toHaveLength(1);
    expect(hubs[0].label).toBe("Mr. Hemant Agrawal");
    expect(hubs[0].degree).toBe(2);
    // The solo signatory's entity is never pulled into the graph.
    expect(g.nodes.find((n) => n.id === "c")).toBeUndefined();
    expect(g.stats.entitiesConnected).toBe(2);
    expect(g.stats.entitiesTotal).toBe(3);
  });

  it("routes edges through the hub instead of wiring entities pairwise", () => {
    // Four entities on one person: 4 hub edges, not the 6 of a clique.
    const g = buildGraph(
      ["a", "b", "c", "d"].map((id) => ent(id)),
      ["a", "b", "c", "d"].map((id) => ({ name: "Mr. Shared", entity_id: id })) as PersonRow[]
    );
    expect(g.links).toHaveLength(4);
    expect(g.links.every((l) => l.source === "p:Mr. Shared")).toBe(true);
    expect(g.links.every((l) => l.kind === "person")).toBe(true);
  });

  it("rejects IFSCA placeholder contact names", () => {
    const g = buildGraph(
      [ent("a"), ent("b"), ent("c"), ent("d")],
      [
        { name: "-", entity_id: "a" },
        { name: "-", entity_id: "b" },
        { name: "NA", entity_id: "c" },
        { name: "NA", entity_id: "d" },
      ] as PersonRow[]
    );
    expect(g.nodes.filter((n) => n.kind === "person")).toHaveLength(0);
    expect(g.links).toHaveLength(0);
  });

  it("groups addresses that differ only in punctuation, spacing or case", () => {
    const g = buildGraph(
      [
        ent("a", { registered_address: ADDR }),
        ent("b", { registered_address: ADDR.toUpperCase().replace(/,/g, " ") }),
        ent("c", { registered_address: `  ${ADDR}  ` }),
      ],
      []
    );
    const hubs = g.nodes.filter((n) => n.kind === "address");
    expect(hubs).toHaveLength(1);
    expect(hubs[0].degree).toBe(3);
    expect(g.links.every((l) => l.kind === "address")).toBe(true);
    // The longest original spelling is kept for display.
    expect(hubs[0].label.length).toBeGreaterThanOrEqual(ADDR.length);
  });

  it("ignores address strings too short to be real addresses", () => {
    const g = buildGraph(
      [ent("a", { registered_address: "GIFT City" }), ent("b", { registered_address: "GIFT City" })],
      []
    );
    expect(g.nodes.filter((n) => n.kind === "address")).toHaveLength(0);
  });

  it("drops implausibly large hubs rather than letting them swamp the layout", () => {
    const many = Array.from({ length: 45 }, (_, i) => ent(`e${i}`, { registered_address: ADDR }));
    const g = buildGraph(many, []);
    expect(g.nodes.filter((n) => n.kind === "address")).toHaveLength(0);
    expect(g.stats.entitiesConnected).toBe(0);
  });

  it("separates unrelated groups into their own clusters", () => {
    const g = buildGraph(
      ["a", "b", "c", "d"].map((id) => ent(id)),
      [
        { name: "Mr. One", entity_id: "a" },
        { name: "Mr. One", entity_id: "b" },
        { name: "Mr. Two", entity_id: "c" },
        { name: "Mr. Two", entity_id: "d" },
      ] as PersonRow[]
    );
    expect(g.stats.clusters).toBe(2);
    expect(g.stats.largestCluster).toBe(3); // hub + two entities
    const a = g.nodes.find((n) => n.id === "a")!;
    const c = g.nodes.find((n) => n.id === "c")!;
    expect(a.cluster).not.toBe(c.cluster);
  });

  it("merges a person link and an address link into one cluster", () => {
    const g = buildGraph(
      [
        ent("a", { registered_address: ADDR }),
        ent("b", { registered_address: ADDR }),
        ent("c"),
      ],
      [
        { name: "Mr. Bridge", entity_id: "b" },
        { name: "Mr. Bridge", entity_id: "c" },
      ] as PersonRow[]
    );
    // a—address—b—person—c is a single connected component.
    expect(g.stats.clusters).toBe(1);
    expect(g.stats.entitiesConnected).toBe(3);
    // b sits on two hubs, so its degree is 2.
    expect(g.nodes.find((n) => n.id === "b")!.degree).toBe(2);
  });

  it("reports the biggest person and address hubs", () => {
    const g = buildGraph(
      [ent("a", { registered_address: ADDR }), ent("b", { registered_address: ADDR }), ent("c")],
      [
        { name: "Mr. Top", entity_id: "a" },
        { name: "Mr. Top", entity_id: "b" },
        { name: "Mr. Top", entity_id: "c" },
      ] as PersonRow[]
    );
    expect(g.stats.biggestPerson).toEqual({ name: "Mr. Top", count: 3 });
    expect(g.stats.biggestAddress?.count).toBe(2);
  });
});
