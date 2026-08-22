import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BuildingExplorer from "@/components/BuildingExplorer";
import { buildCity, type Tower } from "@/lib/towers";
import { selectAll } from "@/lib/supabase";
import { categoryMeta } from "@/lib/format";

export const revalidate = 3600;

type Row = {
  id: string;
  name: string;
  category: string | null;
  status: string | null;
  registered_address: string | null;
};

async function getTower(key: string): Promise<{ tower: Tower; all: Tower[] } | null> {
  const rows = await selectAll<Row>("entities", "id,name,category,status,registered_address");
  const city = buildCity(rows);
  const tower = city.towers.find((t) => t.key === key);
  return tower ? { tower, all: city.towers } : null;
}

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const found = await getTower(params.key);
  if (!found) return { title: "Building not found" };
  const { tower } = found;
  return {
    title: `${tower.name} — who is registered on which floor`,
    description: `${tower.total} IFSCA-regulated entities are registered at ${tower.name} in GIFT City, across ${tower.topFloor + 1} storeys. Browse the tenants floor by floor.`,
    alternates: { canonical: `/towers/${tower.key}` },
  };
}

export default async function BuildingPage({ params }: { params: { key: string } }) {
  const found = await getTower(params.key);
  if (!found) notFound();
  const { tower, all } = found;

  // Sector mix, so the page says what kind of building this is.
  const mix = new Map<string, number>();
  for (const f of tower.floors) for (const o of f.occupants) {
    const label = categoryMeta(o.category || "").label;
    mix.set(label, (mix.get(label) || 0) + 1);
  }
  for (const o of tower.unplaced) {
    const label = categoryMeta(o.category || "").label;
    mix.set(label, (mix.get(label) || 0) + 1);
  }
  const topMix = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const busiest = [...tower.floors].sort((a, b) => b.occupants.length - a.occupants.length)[0];

  return (
    <div style={{ padding: "24px 0" }}>
      <div className="bld-crumb">
        <Link href="/towers">← The GIFT City Skyline</Link>
      </div>

      <div className="section-head">
        <h1>{tower.name}</h1>
        <span className="count">{tower.total.toLocaleString("en-IN")} firms</span>
      </div>

      <p className="net-standfirst">
        {tower.note}. {tower.total.toLocaleString("en-IN")} IFSCA-regulated entities are registered at
        this address across {tower.topFloor + 1} storeys
        {busiest && busiest.occupants.length > 0 && (
          <>
            , the busiest being{" "}
            <strong>
              {busiest.floor === 0 ? "the ground floor" : `floor ${busiest.floor}`} with{" "}
              {busiest.occupants.length}
            </strong>
          </>
        )}
        .
      </p>

      <div className="bld-mix">
        {topMix.map(([label, n]) => (
          <span key={label}>
            <i style={{ background: categoryMeta(label).color }} />
            {label} <strong>{n}</strong>
          </span>
        ))}
      </div>

      <BuildingExplorer tower={tower} />

      <div className="section-head" style={{ marginTop: 34 }}>
        <h2>Other buildings</h2>
      </div>
      <div className="bld-others">
        {all
          .filter((t) => t.key !== tower.key)
          .map((t) => (
            <Link key={t.key} href={`/towers/${t.key}`} className="bld-other">
              <strong>{t.name}</strong>
              <span>
                {t.total} firm{t.total === 1 ? "" : "s"} · {t.topFloor + 1} storey{t.topFloor === 0 ? "" : "s"}
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}
