// Building portraits.
//
// These are drawings, not photographs — stylised elevations in the paper's own
// hand. What makes them worth looking at is that they are not decoration: the
// windows ARE the data. Every lit window is one regulated entity on that
// storey, so a floor holding fifty firms blazes and an empty storey goes dark.
// The proportions (height, bay count) come from the register; the colouring
// takes its cue from the real towers, which are mostly dark glass with
// coloured vertical fins.

export type Facade = {
  /** window columns across the elevation */
  bays: number;
  /** base curtain-wall tone */
  glass: string;
  /** an unoccupied window */
  dark: string;
  /** an occupied window */
  lit: string;
  /** vertical accent fin — the strongest visual signature of each tower */
  fin: string;
  /** how the building meets the sky */
  crown: "signage" | "stepped" | "flat";
  /** storeys drawn as a taller, glassier podium */
  podium: number;
};

const DEFAULT: Facade = {
  bays: 9,
  glass: "#2b333b",
  dark: "#39434d",
  lit: "#e8c169",
  fin: "#8c4a34",
  crown: "flat",
  podium: 1,
};

// Per-building character. Bay counts are chosen to suit each tower's real
// proportions — a broad low block reads wider, a slim tower narrower.
const FACADES: Record<string, Partial<Facade>> = {
  signature: { bays: 11, fin: "#b8452c", crown: "signage", podium: 1, glass: "#272f37" },
  "pragya-accel": { bays: 14, fin: "#9a6a1a", crown: "flat", podium: 1, glass: "#333a33" },
  "pragya-tower": { bays: 9, fin: "#7a6a2a", crown: "stepped", podium: 1 },
  incubation: { bays: 12, fin: "#2f6b4a", crown: "flat", podium: 1, glass: "#2c3835" },
  brigade: { bays: 10, fin: "#1f5a6a", crown: "stepped", podium: 1, glass: "#26323a" },
  aspire: { bays: 8, fin: "#6a2f5a", crown: "flat", podium: 1 },
  wtc: { bays: 7, fin: "#3a4a7a", crown: "signage", podium: 1, glass: "#242c38" },
  "gift-one": { bays: 6, fin: "#7a1f1f", crown: "signage", podium: 1, glass: "#232a32" },
  "gift-house": { bays: 8, fin: "#5a5148", crown: "flat", podium: 1 },
};

export function facadeFor(key: string): Facade {
  return { ...DEFAULT, ...(FACADES[key] || {}) };
}

/**
 * How many of a storey's windows are lit, and how brightly. Beyond the bay
 * count every window is on, so the extra density is carried by brightness
 * rather than by inventing windows the elevation does not have.
 */
export function litWindows(count: number, bays: number): { lit: number; intensity: number } {
  if (count <= 0) return { lit: 0, intensity: 0 };
  if (count <= bays) return { lit: count, intensity: 0.72 };
  // 1 full building-width per bay-count of firms, capped so the brightest
  // floors stay distinguishable from merely busy ones.
  const over = Math.min(1, (count - bays) / (bays * 3));
  return { lit: bays, intensity: 0.72 + over * 0.28 };
}
