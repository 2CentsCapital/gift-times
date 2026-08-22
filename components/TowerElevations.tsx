"use client";

import { useMemo, useState } from "react";
import type { City, Occupant, Tower } from "@/lib/towers";
import { FAMILY_LEGEND } from "@/lib/format";

// Geometry. Floors are a fixed height so the towers read as buildings whose
// heights can be compared; occupancy is expressed by how densely each storey
// is packed, not by making busy floors taller.
const COL_W = 132;
const GAP = 22;
const FLOOR_H = 15;
const FLOOR_GAP = 2;
const GUTTER = 20; // left strip carrying the floor numbers
const BASE_H = 26; // the "storey not stated" plinth below ground
const TOP_PAD = 16;
const NAME_H = 62;

type Hovered = { tower: Tower; floor: number | null; occupants: Occupant[] } | null;

export default function TowerElevations({ city }: { city: City }) {
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<Hovered>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const ids = new Set<string>();
    for (const t of city.towers) {
      for (const f of t.floors) for (const o of f.occupants) if (o.name.toLowerCase().includes(q)) ids.add(o.id);
      for (const o of t.unplaced) if (o.name.toLowerCase().includes(q)) ids.add(o.id);
    }
    return ids;
  }, [q, city]);

  const tallest = Math.max(...city.towers.map((t) => t.topFloor));
  const bodyH = (tallest + 1) * (FLOOR_H + FLOOR_GAP);
  const svgH = TOP_PAD + bodyH + BASE_H + NAME_H;
  const svgW = city.towers.length * (COL_W + GAP) + GUTTER;

  // Ground line sits at the bottom of floor 0 for every tower, so the
  // buildings share a datum the way an elevation drawing would.
  const groundY = TOP_PAD + bodyH;
  const floorY = (f: number) => groundY - (f + 1) * (FLOOR_H + FLOOR_GAP) + FLOOR_GAP;

  function cells(occupants: Occupant[], x: number, y: number, keyBase: string) {
    const n = occupants.length;
    if (!n) return null;
    const inner = COL_W - GUTTER - 6;
    // Cells shrink to fit rather than wrapping: a floor is one storey, so it
    // gets one row. A packed floor simply reads as finer striping.
    const cw = Math.max(1.1, Math.min(11, inner / n - (n > 40 ? 0 : 1)));
    const step = n > 1 ? (inner - cw) / (n - 1) : 0;
    return occupants.map((o, i) => {
      const dim = matches ? !matches.has(o.id) : false;
      return (
        <rect
          key={`${keyBase}-${o.id}-${i}`}
          x={x + GUTTER + 3 + i * step}
          y={y + 2}
          width={cw}
          height={FLOOR_H - 4}
          fill={o.color}
          opacity={dim ? 0.13 : 0.92}
        />
      );
    });
  }

  return (
    <div>
      <div className="net-controls">
        <input
          className="net-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a firm in the city — type a name…"
          aria-label="Find a firm in the towers"
        />
        {matches && (
          <span className="twr-matchline">
            {matches.size === 0
              ? `No firm here matches “${query.trim()}”.`
              : `${matches.size} firm${matches.size === 1 ? "" : "s"} lit up.`}
          </span>
        )}
      </div>

      <div className="twr-legend">
        {FAMILY_LEGEND.map((f) => (
          <span key={f.label}>
            <i style={{ background: f.color }} />
            {f.label}
          </span>
        ))}
      </div>

      <div className="twr-scroll">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="twr-svg"
          role="img"
          aria-label="Elevation drawings of GIFT City's towers, with each regulated entity placed on its registered floor"
        >
          {/* ground datum */}
          <line x1={0} y1={groundY} x2={svgW} y2={groundY} stroke="#1a1712" strokeWidth={1.5} />

          {city.towers.map((t, ti) => {
            const x = ti * (COL_W + GAP);
            return (
              <g key={t.key}>
                {/* the plinth: in this building, storey not stated */}
                {t.unplaced.length > 0 && (
                  <g
                    onMouseEnter={() => setHovered({ tower: t, floor: null, occupants: t.unplaced })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <rect
                      x={x + GUTTER}
                      y={groundY + 4}
                      width={COL_W - GUTTER}
                      height={BASE_H - 8}
                      fill="#e7e0d1"
                      stroke="#ddd5c4"
                    />
                    {cells(t.unplaced, x, groundY + 4 + (FLOOR_H - (BASE_H - 8)) / 2, `${t.key}-base`)}
                    <text x={x + GUTTER + 4} y={groundY + BASE_H - 9} className="twr-basetext">
                      {t.unplaced.length} · floor not stated
                    </text>
                  </g>
                )}

                {/* storeys, ground up */}
                {t.floors.map((f) => {
                  const y = floorY(f.floor);
                  const id = `${t.key}:${f.floor}`;
                  const hasMatch = matches ? f.occupants.some((o) => matches.has(o.id)) : false;
                  return (
                    <g
                      key={id}
                      className="twr-floor"
                      onMouseEnter={() => setHovered({ tower: t, floor: f.floor, occupants: f.occupants })}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <rect
                        x={x + GUTTER}
                        y={y}
                        width={COL_W - GUTTER}
                        height={FLOOR_H}
                        fill={hasMatch ? "#fff8e2" : "#fbf9f3"}
                        stroke={hasMatch ? "#a97a1a" : "#e2dacb"}
                        strokeWidth={hasMatch ? 1.2 : 0.8}
                      />
                      {cells(f.occupants, x, y, id)}
                      {f.floor % 2 === 0 && (
                        <text x={x + GUTTER - 4} y={y + FLOOR_H - 4} className="twr-floornum">
                          {f.floor === 0 ? "G" : f.floor}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* nameplate — doubles as the way into the building */}
                <a href={"/towers/" + t.key}>
                  <text x={x + GUTTER} y={groundY + BASE_H + 18} className="twr-name">
                    {t.name}
                  </text>
                </a>
                <text x={x + GUTTER} y={groundY + BASE_H + 32} className="twr-note">
                  {t.note.length > 26 ? t.note.slice(0, 25) + "…" : t.note}
                </text>
                <text x={x + GUTTER} y={groundY + BASE_H + 48} className="twr-total">
                  {t.total} firms · {t.topFloor === 0 ? "1 storey" : `${t.topFloor + 1} storeys`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hovered && (
        <div className="twr-tip" role="status">
          <div className="twr-tip-head">
            {hovered.tower.name} ·{" "}
            {hovered.floor === null
              ? "storey not stated"
              : hovered.floor === 0
              ? "ground floor"
              : `floor ${hovered.floor}`}
          </div>
          <strong>
            {hovered.occupants.length} firm{hovered.occupants.length === 1 ? "" : "s"}
          </strong>
          <div className="twr-tip-list">
            {hovered.occupants.slice(0, 6).map((o) => o.name).join(" · ")}
            {hovered.occupants.length > 6 ? ` · +${hovered.occupants.length - 6} more` : ""}
          </div>
          {hovered.occupants.length > 0 && <div className="twr-tip-hint">Click the storey to list every tenant →</div>}
        </div>
      )}

      <p className="net-hint">
        Each band is one storey; each mark on it is one regulated entity, coloured by sector. Hover a
        storey to read it, click to list its tenants. The plinth below the ground line holds firms whose
        address names the building but not the floor.
      </p>

    </div>
  );
}
