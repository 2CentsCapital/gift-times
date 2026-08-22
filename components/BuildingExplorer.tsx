"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Occupant, Tower } from "@/lib/towers";
import { facadeFor, litWindows } from "@/lib/facade";
import { groupByFirm } from "@/lib/names";
import { categoryMeta } from "@/lib/format";

// Elevation geometry. Storeys are deliberately generous — the whole point of
// this page is that you can hit a floor with a mouse or a thumb.
const W = 300;
const FLOOR_H = 26;
const PODIUM_H = 40;
const CROWN_H = 26;
const PAD = 18;

type Props = { tower: Tower };

export default function BuildingExplorer({ tower }: Props) {
  const facade = facadeFor(tower.key);
  const [selected, setSelected] = useState<number | "unplaced" | null>(null);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  const q = query.trim().toLowerCase();

  // Which storeys contain a match, so the elevation can point at them.
  const matchFloors = useMemo(() => {
    if (!q) return null;
    const set = new Set<number | "unplaced">();
    for (const f of tower.floors) {
      if (f.occupants.some((o) => o.name.toLowerCase().includes(q))) set.add(f.floor);
    }
    if (tower.unplaced.some((o) => o.name.toLowerCase().includes(q))) set.add("unplaced");
    return set;
  }, [q, tower]);

  // Typing should take you somewhere, so jump to the first matching storey.
  useEffect(() => {
    if (!matchFloors || matchFloors.size === 0) return;
    const first = [...matchFloors].find((f) => f !== "unplaced");
    setSelected(first ?? "unplaced");
  }, [matchFloors]);

  const occupantsOf = (f: number | "unplaced"): Occupant[] =>
    f === "unplaced" ? tower.unplaced : tower.floors.find((x) => x.floor === f)?.occupants ?? [];

  const shown = selected === null ? [] : occupantsOf(selected);
  const firms = useMemo(() => {
    const filtered = q ? shown.filter((o) => o.name.toLowerCase().includes(q)) : shown;
    return groupByFirm(filtered);
  }, [shown, q]);

  // Count licences over what is actually on screen, not the whole storey —
  // a filtered view must not report a total the reader cannot see.
  const licenceCount = firms.reduce((n, g) => n + g.licences, 0);

  const bodyH = (tower.topFloor + 1) * FLOOR_H;
  const svgH = PAD + CROWN_H + bodyH + PODIUM_H + 26;
  const topY = PAD + CROWN_H;
  const groundY = topY + bodyH;
  const yOf = (f: number) => groundY - (f + 1) * FLOOR_H;

  return (
    <div className="bld-grid">
      {/* ---------------- the elevation ---------------- */}
      <div className="bld-portrait">
        <svg
          viewBox={`0 0 ${W + PAD * 2} ${svgH}`}
          className="bld-svg"
          role="img"
          aria-label={`Stylised elevation of ${tower.name}. Each lit window is one regulated entity on that storey.`}
        >
          <defs>
            <linearGradient id={`sky-${tower.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#efe9dc" />
              <stop offset="100%" stopColor="#f5f2ea" />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={W + PAD * 2} height={svgH} fill={`url(#sky-${tower.key})`} />

          {/* crown */}
          {facade.crown === "signage" && (
            <>
              <rect x={PAD + W * 0.28} y={PAD} width={W * 0.44} height={CROWN_H - 8} fill={facade.fin} opacity={0.9} />
              <text x={PAD + W * 0.5} y={PAD + CROWN_H - 17} className="bld-sign">
                {tower.name.split(" ")[0].toUpperCase()}
              </text>
            </>
          )}
          {facade.crown === "stepped" && (
            <rect x={PAD + W * 0.16} y={PAD + 8} width={W * 0.68} height={CROWN_H - 8} fill={facade.glass} />
          )}

          {/* curtain wall */}
          <rect x={PAD} y={topY} width={W} height={bodyH} fill={facade.glass} />

          {/* storeys — the clickable part */}
          {tower.floors.map((f) => {
            const y = yOf(f.floor);
            const { lit, intensity } = litWindows(f.occupants.length, facade.bays);
            const isSel = selected === f.floor;
            const isMatch = matchFloors?.has(f.floor) ?? false;
            const bw = (W - 22) / facade.bays;
            return (
              <g
                key={f.floor}
                className="bld-floor"
                onClick={() => setSelected(isSel ? null : f.floor)}
                role="button"
                tabIndex={0}
                aria-label={`Floor ${f.floor}, ${f.occupants.length} firms`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isSel ? null : f.floor);
                  }
                }}
              >
                {/* full-width hit area, so the target is the whole storey */}
                <rect x={PAD} y={y} width={W} height={FLOOR_H} fill="transparent" />
                {Array.from({ length: facade.bays }).map((_, b) => {
                  const on = b < lit;
                  return (
                    <rect
                      key={b}
                      x={PAD + 11 + b * bw + 1.5}
                      y={y + 5}
                      width={bw - 3}
                      height={FLOOR_H - 11}
                      fill={on ? facade.lit : facade.dark}
                      opacity={on ? intensity : 0.55}
                    />
                  );
                })}
                {/* vertical fins ride over the glass */}
                {Array.from({ length: facade.bays + 1 }).map((_, b) => (
                  <rect key={`f${b}`} x={PAD + 10 + b * bw} y={y} width={2} height={FLOOR_H} fill={facade.fin} opacity={0.5} />
                ))}
                {(isSel || isMatch) && (
                  <rect
                    x={PAD - 3}
                    y={y}
                    width={W + 6}
                    height={FLOOR_H}
                    fill="none"
                    stroke={isSel ? "#7a1f1f" : "#a97a1a"}
                    strokeWidth={isSel ? 2.4 : 1.6}
                  />
                )}
                <text x={PAD - 8} y={y + FLOOR_H / 2 + 4} className={`bld-fnum${isSel ? " is-sel" : ""}`}>
                  {f.floor === 0 ? "G" : f.floor}
                </text>
                <text x={PAD + W + 8} y={y + FLOOR_H / 2 + 4} className={`bld-fcount${isSel ? " is-sel" : ""}`}>
                  {f.occupants.length || ""}
                </text>
              </g>
            );
          })}

          {/* podium + ground */}
          <rect x={PAD - 8} y={groundY} width={W + 16} height={PODIUM_H} fill={facade.glass} opacity={0.92} />
          {Array.from({ length: 6 }).map((_, i) => (
            <rect
              key={i}
              x={PAD - 2 + i * ((W + 4) / 6)}
              y={groundY + 8}
              width={(W + 4) / 6 - 10}
              height={PODIUM_H - 16}
              fill={facade.dark}
              opacity={0.7}
            />
          ))}
          <rect x={PAD + W * 0.4} y={groundY + PODIUM_H - 16} width={W * 0.2} height={16} fill={facade.fin} opacity={0.85} />
          <line
            x1={0}
            y1={groundY + PODIUM_H}
            x2={W + PAD * 2}
            y2={groundY + PODIUM_H}
            stroke="#1a1712"
            strokeWidth={1.6}
          />
        </svg>

        {tower.unplaced.length > 0 && (
          <button
            type="button"
            className={`bld-unplaced${selected === "unplaced" ? " is-sel" : ""}`}
            onClick={() => setSelected(selected === "unplaced" ? null : "unplaced")}
          >
            {tower.unplaced.length} firms in this building with no floor stated →
          </button>
        )}
        <p className="bld-caption">
          A stylised elevation, not a photograph. Every lit window is one regulated entity on that
          storey — click a floor to read it.
        </p>
      </div>

      {/* ---------------- the reader ---------------- */}
      <div className="bld-panel" ref={panelRef}>
        <input
          className="net-search bld-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search inside ${tower.name}…`}
          aria-label={`Search firms inside ${tower.name}`}
        />
        {matchFloors && (
          <div className="bld-matchline">
            {matchFloors.size === 0
              ? `Nothing in this building matches “${query.trim()}”.`
              : `Found on ${matchFloors.size} storey${matchFloors.size === 1 ? "" : "s"}.`}
          </div>
        )}

        {selected === null ? (
          <div className="bld-empty">
            <strong>Pick a storey</strong>
            <p>
              Click any floor on the elevation to list the firms registered there. Brighter floors
              hold more.
            </p>
            <ul className="bld-quick">
              {[...tower.floors]
                .filter((f) => f.occupants.length)
                .sort((a, b) => b.occupants.length - a.occupants.length)
                .slice(0, 5)
                .map((f) => (
                  <li key={f.floor}>
                    <button type="button" onClick={() => setSelected(f.floor)}>
                      {f.floor === 0 ? "Ground floor" : `Floor ${f.floor}`}
                      <span>{f.occupants.length} firms</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="bld-floorhead">
              <h2>
                {selected === "unplaced"
                  ? "Floor not stated"
                  : selected === 0
                  ? "Ground floor"
                  : `Floor ${selected}`}
              </h2>
              <span>
                {firms.length} firm{firms.length === 1 ? "" : "s"}
                {licenceCount > firms.length && ` · ${licenceCount} licences`}
              </span>
            </div>
            {firms.length === 0 ? (
              <p className="empty">No firm on this storey matches that search.</p>
            ) : (
              <ul className="bld-firms">
                {firms.map((g) => {
                  const cat = g.items[0]?.category || null;
                  const meta = categoryMeta(cat || "");
                  return (
                    <li key={g.key}>
                      <Link href={`/entity/${g.items[0].id}`} className="bld-firm">
                        <span className="bld-firm-dot" style={{ background: meta.color }} />
                        <span className="bld-firm-name">
                          {g.short}
                          {g.licences > 1 && <em className="bld-lic">{g.licences} licences</em>}
                        </span>
                        <span className="bld-firm-cat">{meta.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
