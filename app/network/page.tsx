import Link from "next/link";
import type { Metadata } from "next";
import NetworkGraph from "@/components/NetworkGraph";
import { getNetworkGraph } from "@/lib/network";

// Rebuilt on the same cadence as the ingest.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The GIFT City Network — who is connected to whom",
  description:
    "An interactive map of GIFT IFSC: every regulated entity that shares an authorised person or a registered address with another, drawn from IFSCA's public directory.",
  alternates: { canonical: "/network" },
};

export default async function NetworkPage() {
  const graph = await getNetworkGraph();
  const { stats } = graph;

  const hubs = graph.nodes
    .filter((n) => n.kind !== "entity")
    .sort((a, b) => b.degree - a.degree);
  const topPeople = hubs.filter((n) => n.kind === "person").slice(0, 12);
  const topAddresses = hubs.filter((n) => n.kind === "address").slice(0, 8);

  // For each hub we want its entities, to list them under the graph.
  const entitiesOf = new Map<string, { id: string; label: string }[]>();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const l of graph.links) {
    const t = nodeById.get(l.target);
    if (!t || t.kind !== "entity") continue;
    if (!entitiesOf.has(l.source)) entitiesOf.set(l.source, []);
    entitiesOf.get(l.source)!.push({ id: t.id, label: t.label });
  }

  return (
    <div style={{ padding: "24px 0" }}>
      <div className="section-head">
        <h1>The GIFT City Network</h1>
        <span className="count">{stats.entitiesConnected.toLocaleString("en-IN")} connected</span>
      </div>

      <p className="net-standfirst">
        IFSCA publishes an authorised contact person and a registered address for every regulated
        entity. Individually those are administrative details. Taken together they reveal the shape
        of GIFT IFSC: where one person signs for a dozen firms, and where a single floor of a single
        tower houses an entire cluster of them.
      </p>
      <p className="net-standfirst net-standfirst--muted">
        Every line below is drawn from IFSCA&apos;s own directory. A shared person or address is a
        matter of public record — it is not, by itself, evidence of common ownership or control.
      </p>

      <NetworkGraph />

      {/* ---- The people who connect the most firms ---- */}
      <div className="section-head" style={{ marginTop: 34 }}>
        <h2>The connectors</h2>
        <span className="count">{stats.peopleHubs} people</span>
      </div>
      <p className="net-standfirst net-standfirst--muted" style={{ marginTop: 0 }}>
        Authorised persons named by IFSCA for more than one registered entity.
      </p>
      <div className="net-table">
        {topPeople.map((p) => (
          <div className="net-row" key={p.id}>
            <div className="net-row-head">
              <span className="net-count">{p.degree}</span>
              <strong>{p.label}</strong>
            </div>
            <div className="net-row-list">
              {(entitiesOf.get(p.id) || []).map((e, i) => (
                <span key={e.id}>
                  {i > 0 && " · "}
                  <Link href={`/entity/${e.id}`}>{e.label}</Link>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Shared addresses ---- */}
      <div className="section-head" style={{ marginTop: 30 }}>
        <h2>Shared addresses</h2>
        <span className="count">{stats.addressHubs} addresses</span>
      </div>
      <p className="net-standfirst net-standfirst--muted" style={{ marginTop: 0 }}>
        One registered address, several regulated entities — typically a corporate-services provider,
        an incubation floor or a group head office.
      </p>
      <div className="net-table">
        {topAddresses.map((a) => (
          <div className="net-row" key={a.id}>
            <div className="net-row-head">
              <span className="net-count">{a.degree}</span>
              <strong className="net-addr">{a.label}</strong>
            </div>
            <div className="net-row-list">
              {(entitiesOf.get(a.id) || []).map((e, i) => (
                <span key={e.id}>
                  {i > 0 && " · "}
                  <Link href={`/entity/${e.id}`}>{e.label}</Link>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
