// GIFT City, drawn as a section.
//
// A map is the wrong instrument for this register. GIFT SEZ is one 886-acre
// site, so every address inside it geocodes to more or less the same dot —
// the interesting variation is *vertical*. Signature Building alone holds
// hundreds of regulated entities stacked across sixteen floors, and IFSCA's
// address strings record which one each firm sits on.
//
// So instead of pins we parse the address into (tower, floor) and draw the
// actual buildings as elevations, with every firm on its real storey.

import { categoryMeta } from "./format";

export type Occupant = {
  id: string;
  name: string;
  category: string | null;
  color: string;
};

export type TowerFloor = { floor: number; occupants: Occupant[] };

export type Tower = {
  key: string;
  name: string;
  /** shown under the name — what the building actually is */
  note: string;
  floors: TowerFloor[];
  /** in the building, but the address does not say which storey */
  unplaced: Occupant[];
  total: number;
  topFloor: number;
};

export type City = {
  towers: Tower[];
  stats: {
    addressed: number;
    inGiftCity: number;
    elsewhere: number;
    placedExactly: number;
    towerOnly: number;
    densestFloor: { tower: string; floor: number; count: number } | null;
  };
};

type Row = {
  id: string;
  name: string;
  category: string | null;
  status: string | null;
  registered_address: string | null;
};

// Order matters: the first pattern to match wins, so the specific buildings
// are listed before the generic ones.
//
// "Hiranandani Signature" and "Signature Building" are the same tower — 63 of
// the 65 addresses naming Hiranandani also say Signature — so they share a
// bucket rather than being double-counted as two buildings.
const TOWERS: { key: string; name: string; note: string; re: RegExp }[] = [
  { key: "pragya-accel", name: "Pragya Accelerator", note: "Accelerator 1 & 2", re: /pragya\s*[-\s]*accele?rt?ator?/i },
  { key: "pragya-tower", name: "Pragya Tower II", note: "Pragya II / Pragya Towers", re: /pragya/i },
  { key: "signature", name: "Signature Building", note: "Hiranandani Signature, Block 13B", re: /signature/i },
  { key: "incubation", name: "Incubation Centre", note: "GIFT incubation / co-working", re: /incubation|flexone|co[-\s]*working/i },
  { key: "brigade", name: "Brigade", note: "Brigade International Financial Centre", re: /brigade/i },
  { key: "aspire", name: "GIFT Aspire", note: "GIFT Aspire building", re: /gift\s*aspire/i },
  { key: "wtc", name: "WTC GIFT City", note: "World Trade Centre towers", re: /world\s*trade|\bwtc\b/i },
  { key: "gift-one", name: "GIFT Tower One", note: "GIFT One / GIFT Two", re: /gift\s*tower|gift\s*one|gift\s*two/i },
  { key: "gift-house", name: "GIFT House", note: "GIFT House", re: /gift\s*house/i },
];

export const TOWER_KEYS = TOWERS.map((t) => t.key);

const WORD_FLOOR: Record<string, number> = {
  ground: 0, lower: 0, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11,
  twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
};

// "11th Floor" · "Floor No. 5" · "Second Floor" · "604, 6th Floor"
//
// The word boundaries matter more than they look. Without them "Unit 402
// Floor" matches the trailing "02" of the unit number and reports storey 2.
const NUM_FLOOR = /\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*floor/i;
const FLOOR_NO = /floor\s*(?:no\.?|number)?\s*[-:]?\s*(\d{1,2})\b/i;
const NAMED_FLOOR = new RegExp(`\\b(${Object.keys(WORD_FLOOR).join("|")})\\s*floor`, "i");

export function parseFloor(address: string): number | null {
  const named = address.match(NAMED_FLOOR);
  if (named) return WORD_FLOOR[named[1].toLowerCase()];
  for (const re of [NUM_FLOOR, FLOOR_NO]) {
    const m = address.match(re);
    if (m) {
      const f = Number(m[1]);
      // Nothing in GIFT City is taller than ~30 storeys; anything above that
      // is a unit number that happened to sit next to the word "floor".
      if (f >= 0 && f <= 30) return f;
    }
  }
  return null;
}

// Only addresses that actually say they are in GIFT City count — a great many
// registered offices are in Mumbai or Ahmedabad and must not be placed here.
export function isInGiftCity(address: string): boolean {
  return /gift\s*(sez|city)|gandhinagar|382355/i.test(address);
}

export function parseTower(address: string): string | null {
  if (!isInGiftCity(address)) return null;
  for (const t of TOWERS) if (t.re.test(address)) return t.key;
  return null;
}

export function buildCity(rows: Row[]): City {
  const addressed = rows.filter((r) => (r.registered_address || "").trim().length > 10);
  let inGiftCity = 0;
  let placedExactly = 0;
  let towerOnly = 0;

  const byTower = new Map<string, { floors: Map<number, Occupant[]>; unplaced: Occupant[] }>();

  for (const r of addressed) {
    const addr = (r.registered_address || "").trim();
    if (!isInGiftCity(addr)) continue;
    inGiftCity++;
    const key = parseTower(addr);
    if (!key) continue;

    const occupant: Occupant = {
      id: r.id,
      name: r.name,
      category: r.category,
      color: categoryMeta(r.category || "").color,
    };
    if (!byTower.has(key)) byTower.set(key, { floors: new Map(), unplaced: [] });
    const bucket = byTower.get(key)!;
    const floor = parseFloor(addr);
    if (floor === null) {
      bucket.unplaced.push(occupant);
      towerOnly++;
    } else {
      if (!bucket.floors.has(floor)) bucket.floors.set(floor, []);
      bucket.floors.get(floor)!.push(occupant);
      placedExactly++;
    }
  }

  let densest: City["stats"]["densestFloor"] = null;

  const towers: Tower[] = TOWERS.map((def) => {
    const bucket = byTower.get(def.key);
    if (!bucket) return null;
    const topFloor = Math.max(0, ...bucket.floors.keys());
    // Render every storey from ground to the top, including empty ones — a
    // building with a gap in the middle should look like a building, not a
    // bar chart with holes.
    const floors: TowerFloor[] = [];
    for (let f = 0; f <= topFloor; f++) {
      const occupants = (bucket.floors.get(f) || []).sort((a, b) => a.name.localeCompare(b.name));
      floors.push({ floor: f, occupants });
      if (occupants.length && (!densest || occupants.length > densest.count)) {
        densest = { tower: def.name, floor: f, count: occupants.length };
      }
    }
    const total =
      bucket.unplaced.length + floors.reduce((n, f) => n + f.occupants.length, 0);
    return {
      key: def.key,
      name: def.name,
      note: def.note,
      floors,
      unplaced: bucket.unplaced.sort((a, b) => a.name.localeCompare(b.name)),
      total,
      topFloor,
    };
  }).filter(Boolean) as Tower[];

  // Busiest first. Sorting by height instead would lead with GIFT Tower One,
  // which is 25 storeys tall and holds two firms — a mostly empty column in
  // the most prominent position.
  towers.sort((a, b) => b.total - a.total || b.topFloor - a.topFloor);

  return {
    towers,
    stats: {
      addressed: addressed.length,
      inGiftCity,
      elsewhere: addressed.length - inGiftCity,
      placedExactly,
      towerOnly,
      densestFloor: densest,
    },
  };
}
