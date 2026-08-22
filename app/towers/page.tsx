import Link from "next/link";
import type { Metadata } from "next";
import TowerElevations from "@/components/TowerElevations";
import { buildCity } from "@/lib/towers";
import { selectAll } from "@/lib/supabase";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The GIFT City Skyline — every regulated firm, on its actual floor",
  description:
    "GIFT IFSC drawn as an elevation: Signature Building, Pragya, Brigade, GIFT Aspire and the rest, with each IFSCA-regulated entity placed on the storey its registered address names.",
  alternates: { canonical: "/towers" },
};

export default async function TowersPage() {
  const rows = await selectAll<{
    id: string;
    name: string;
    category: string | null;
    status: string | null;
    registered_address: string | null;
  }>("entities", "id,name,category,status,registered_address");

  const city = buildCity(rows);
  const { stats } = city;
  const densest = stats.densestFloor;

  return (
    <div style={{ padding: "24px 0" }}>
      <div className="section-head">
        <h1>The GIFT City Skyline</h1>
        <span className="count">{stats.placedExactly.toLocaleString("en-IN")} firms placed</span>
      </div>

      <p className="net-standfirst">
        GIFT IFSC is not spread across a city — it is stacked inside a handful of towers on one
        886-acre site. A map would put almost every firm on the same dot. So this is an elevation
        instead: the real buildings, drawn to their real heights, with every regulated entity set on
        the storey its registered address names.
      </p>
      {densest && (
        <p className="net-standfirst">
          The most crowded address in the city is{" "}
          <strong>
            {densest.tower}, {densest.floor === 0 ? "ground floor" : `floor ${densest.floor}`}
          </strong>{" "}
          — <strong>{densest.count} regulated entities</strong> on a single storey.
        </p>
      )}
      <p className="net-standfirst net-standfirst--muted">
        Addresses are as IFSCA publishes them. {stats.elsewhere.toLocaleString("en-IN")} entities give a
        registered office outside GIFT City and do not appear here; {stats.towerOnly.toLocaleString("en-IN")}{" "}
        name their building but not their floor, and sit on the plinth beneath it.
      </p>

      <TowerElevations city={city} />

      <div className="section-head" style={{ marginTop: 30 }}>
        <h2>Go inside a building</h2>
        <span className="count">{city.towers.length} buildings</span>
      </div>
      <div className="sky-cards">
        {city.towers.map((t) => {
          const busiest = [...t.floors].sort((a, b) => b.occupants.length - a.occupants.length)[0];
          return (
            <Link key={t.key} href={`/towers/${t.key}`} className="sky-card">
              <strong>{t.name}</strong>
              <span className="note">{t.note}</span>
              <span className="figs">
                <b>{t.total}</b> firm{t.total === 1 ? "" : "s"} · {t.topFloor + 1} storey{t.topFloor === 0 ? "" : "s"}
                {busiest && busiest.occupants.length > 0 && (
                  <>
                    {" "}
                    · busiest {busiest.floor === 0 ? "ground" : `floor ${busiest.floor}`} (
                    {busiest.occupants.length})
                  </>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="net-stats">
        <div>
          <strong>{stats.inGiftCity.toLocaleString("en-IN")}</strong>
          <span>entities registered at a GIFT City address</span>
        </div>
        <div>
          <strong>{stats.placedExactly.toLocaleString("en-IN")}</strong>
          <span>placed to an exact tower and storey</span>
        </div>
        <div>
          <strong>{city.towers.length}</strong>
          <span>buildings identified in the register</span>
        </div>
        <div>
          <strong>{densest ? densest.count : 0}</strong>
          <span>firms on the single busiest storey</span>
        </div>
      </div>
    </div>
  );
}
