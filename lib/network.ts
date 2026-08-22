// The GIFT City network graph.
//
// IFSCA publishes, for every regulated entity, an authorised contact person and
// a registered address. Neither is interesting on its own — but where the *same*
// person signs for several entities, or several entities share one floor of one
// tower, that is a real relationship: a group structure, a shared compliance
// officer, or a corporate-services hub.
//
// We model those shared attributes as their own nodes ("hubs") rather than
// wiring every pair of entities together. A person serving 12 entities becomes
// 12 edges through one person node instead of 66 opaque entity-to-entity edges,
// and the graph then *explains* each connection instead of merely asserting it.

import { selectAll } from "./supabase";
import { categoryMeta, isRealPersonName } from "./format";

export type NodeKind = "entity" | "person" | "address";

export type GraphNode = {
  id: string; // entity uuid, or a synthetic "p:<name>" / "a:<hash>"
  kind: NodeKind;
  label: string;
  /** entity only */
  desk?: string | null;
  category?: string | null;
  status?: string | null;
  color?: string;
  /** hubs only: how many entities hang off this hub */
  degree: number;
  /** connected-component index, assigned after the graph is built */
  cluster: number;
};

export type GraphLink = {
  source: string;
  target: string;
  kind: "person" | "address";
};

export type NetworkGraph = {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: {
    entitiesTotal: number;
    entitiesConnected: number;
    peopleHubs: number;
    addressHubs: number;
    clusters: number;
    largestCluster: number;
    biggestPerson: { name: string; count: number } | null;
    biggestAddress: { label: string; count: number } | null;
  };
};

export type PersonRow = { name: string; entity_id: string };

export type EntityRow = {
  id: string;
  name: string;
  desk: string | null;
  category: string | null;
  status: string | null;
  registered_address: string | null;
};


// Addresses are typed by hand at IFSCA and vary in punctuation/spacing, so
// compare on a normalised key but display the longest original spelling.
function addressKey(raw: string): string | null {
  const k = raw
    .toLowerCase()
    .replace(/[.,;:#'"()\-\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Very short strings are placeholders ("gift city", "-"), not addresses.
  return k.length >= 25 ? k : null;
}

// A hub linking an implausible number of entities is almost always a data
// artefact (a shared PO box, a registrar's own address) rather than a real
// relationship. Keep it out of the graph rather than let it swamp the layout.
const MAX_HUB_DEGREE = 40;

export async function getNetworkGraph(): Promise<NetworkGraph> {
  const [entities, people] = await Promise.all([
    selectAll<EntityRow>("entities", "id,name,desk,category,status,registered_address"),
    selectAll<PersonRow>("people", "name,entity_id"),
  ]);
  return buildGraph(entities, people);
}

// Pure: everything above this line talks to the database, everything below is
// a deterministic function of its inputs — which is what the tests exercise.
export function buildGraph(entities: EntityRow[], people: PersonRow[]): NetworkGraph {
  const entityById = new Map(entities.map((e) => [e.id, e]));

  // ---- group entities by shared authorised person -------------------------
  const byPerson = new Map<string, Set<string>>();
  for (const p of people) {
    const name = (p.name || "").trim();
    if (!isRealPersonName(name) || !entityById.has(p.entity_id)) continue;
    if (!byPerson.has(name)) byPerson.set(name, new Set());
    byPerson.get(name)!.add(p.entity_id);
  }

  // ---- group entities by shared registered address ------------------------
  const byAddress = new Map<string, { ids: Set<string>; display: string }>();
  for (const e of entities) {
    const raw = (e.registered_address || "").trim();
    if (!raw) continue;
    const key = addressKey(raw);
    if (!key) continue;
    if (!byAddress.has(key)) byAddress.set(key, { ids: new Set(), display: raw });
    const g = byAddress.get(key)!;
    g.ids.add(e.id);
    if (raw.length > g.display.length) g.display = raw;
  }

  // ---- build nodes + links from hubs that actually connect something ------
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const connected = new Set<string>();

  const addEntityNode = (id: string) => {
    if (nodes.has(id)) return;
    const e = entityById.get(id)!;
    nodes.set(id, {
      id,
      kind: "entity",
      label: e.name,
      desk: e.desk,
      category: e.category,
      status: e.status,
      color: categoryMeta(e.category || "").color,
      degree: 0,
      cluster: -1,
    });
  };

  let biggestPerson: NetworkGraph["stats"]["biggestPerson"] = null;
  for (const [name, ids] of byPerson) {
    if (ids.size < 2 || ids.size > MAX_HUB_DEGREE) continue;
    const hubId = `p:${name}`;
    nodes.set(hubId, {
      id: hubId,
      kind: "person",
      label: name,
      degree: ids.size,
      cluster: -1,
    });
    for (const id of ids) {
      addEntityNode(id);
      connected.add(id);
      links.push({ source: hubId, target: id, kind: "person" });
    }
    if (!biggestPerson || ids.size > biggestPerson.count) {
      biggestPerson = { name, count: ids.size };
    }
  }

  let biggestAddress: NetworkGraph["stats"]["biggestAddress"] = null;
  let addrSeq = 0;
  for (const [, g] of byAddress) {
    if (g.ids.size < 2 || g.ids.size > MAX_HUB_DEGREE) continue;
    const hubId = `a:${addrSeq++}`;
    nodes.set(hubId, {
      id: hubId,
      kind: "address",
      label: g.display,
      degree: g.ids.size,
      cluster: -1,
    });
    for (const id of g.ids) {
      addEntityNode(id);
      connected.add(id);
      links.push({ source: hubId, target: id, kind: "address" });
    }
    if (!biggestAddress || g.ids.size > biggestAddress.count) {
      biggestAddress = { label: g.display, count: g.ids.size };
    }
  }

  // Entity node degree = how many hubs it sits on.
  for (const l of links) {
    const t = nodes.get(l.target);
    if (t) t.degree += 1;
  }

  // ---- connected components (used for colouring + the "clusters" stat) ----
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (!adj.has(l.source)) adj.set(l.source, []);
    if (!adj.has(l.target)) adj.set(l.target, []);
    adj.get(l.source)!.push(l.target);
    adj.get(l.target)!.push(l.source);
  }
  let cluster = 0;
  let largestCluster = 0;
  for (const node of nodes.values()) {
    if (node.cluster !== -1) continue;
    let size = 0;
    const stack = [node.id];
    node.cluster = cluster;
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      for (const nb of adj.get(cur) || []) {
        const n = nodes.get(nb);
        if (n && n.cluster === -1) {
          n.cluster = cluster;
          stack.push(nb);
        }
      }
    }
    largestCluster = Math.max(largestCluster, size);
    cluster++;
  }

  const list = [...nodes.values()];
  return {
    nodes: list,
    links,
    stats: {
      entitiesTotal: entities.length,
      entitiesConnected: connected.size,
      peopleHubs: list.filter((n) => n.kind === "person").length,
      addressHubs: list.filter((n) => n.kind === "address").length,
      clusters: cluster,
      largestCluster,
      biggestPerson,
      biggestAddress,
    },
  };
}
