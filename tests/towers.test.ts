import { describe, it, expect } from "vitest";
import { buildCity, parseFloor, parseTower, isInGiftCity } from "../lib/towers";

const row = (id: string, address: string, name = `Firm ${id}`) => ({
  id,
  name,
  category: "Fund Management",
  status: "Active",
  registered_address: address,
});

const SEZ = "Block 13B, Zone 1, GIFT SEZ, GIFT City, Gandhinagar - 382355";

describe("parseFloor", () => {
  it("reads ordinal floors", () => {
    expect(parseFloor("Unit no.1129B, Signature Building, 11th Floor, " + SEZ)).toBe(11);
    expect(parseFloor("604, 6th Floor, Hiranandani Signature, " + SEZ)).toBe(6);
    expect(parseFloor("Unit No. PO5-02E, 5th Floor, Tower A WTC Gift City")).toBe(5);
  });

  it("reads spelled-out floors, including ground", () => {
    expect(parseFloor("Unit No 201-A, Second Floor, Hiranandani Signature Building")).toBe(2);
    expect(parseFloor("Unit No. 135, Ground Floor, Pragya Accelerator-2, " + SEZ)).toBe(0);
    expect(parseFloor("Cabin No. 04-22, Fourth Floor, FLEXONE, " + SEZ)).toBe(4);
  });

  it("reads the 'Floor No. N' form", () => {
    expect(parseFloor("Office, Floor No. 7, Brigade, " + SEZ)).toBe(7);
  });

  it("returns null when no floor is stated", () => {
    expect(parseFloor("Unit No. 204, Hiranandani Signature Tower, " + SEZ)).toBeNull();
    expect(parseFloor("Block 15T, Zone 1, GIFT SEZ")).toBeNull();
  });

  it("does not mistake a tall unit number for a storey", () => {
    // 402 is a unit, not a floor — the guard rejects anything above 30.
    expect(parseFloor("Unit 402 Floor 402, " + SEZ)).toBeNull();
  });
});

describe("parseTower", () => {
  it("treats Hiranandani Signature as the Signature Building", () => {
    expect(parseTower("Unit 604, Hiranandani Signature, " + SEZ)).toBe("signature");
    expect(parseTower("Unit 1129B, Signature Building, " + SEZ)).toBe("signature");
  });

  it("separates Pragya Accelerator from Pragya Tower II", () => {
    expect(parseTower("Unit 135, Pragya Accelerator-2, " + SEZ)).toBe("pragya-accel");
    expect(parseTower("Office 507, Pragya II, " + SEZ)).toBe("pragya-tower");
  });

  it("never places an address outside GIFT City", () => {
    // A Mumbai tower must not be drawn into the GIFT City skyline.
    expect(isInGiftCity("1307 D-Wing, Krushal Tower, Chembur, Mumbai - 400089")).toBe(false);
    expect(parseTower("18th Floor, P J Towers, Dalal Street, Mumbai - 400001")).toBeNull();
    expect(parseTower("Office No.116, Signature Complex, Ahmedabad - 380009")).toBeNull();
  });

  it("returns null for a GIFT City address naming no known building", () => {
    expect(parseTower("Plot 42, Road 1C, " + SEZ)).toBeNull();
  });
});

describe("buildCity", () => {
  it("stacks firms onto their stated storeys and counts what it could not place", () => {
    const city = buildCity([
      row("1", "Unit 101, Signature Building, 1st Floor, " + SEZ),
      row("2", "Unit 102, Signature Building, 1st Floor, " + SEZ),
      row("3", "Unit 601, Signature Building, 6th Floor, " + SEZ),
      row("4", "Unit 204, Signature Building, " + SEZ), // no floor
      row("5", "Office 9, Nariman Point, Mumbai - 400021"), // not GIFT City
    ]);
    const sig = city.towers.find((t) => t.key === "signature")!;
    expect(sig.total).toBe(4);
    expect(sig.topFloor).toBe(6);
    expect(sig.floors.find((f) => f.floor === 1)!.occupants).toHaveLength(2);
    expect(sig.unplaced).toHaveLength(1);
    expect(city.stats.placedExactly).toBe(3);
    expect(city.stats.towerOnly).toBe(1);
    expect(city.stats.elsewhere).toBe(1);
  });

  it("draws empty storeys so a building still looks like a building", () => {
    const city = buildCity([
      row("1", "Unit 1, Brigade, Ground Floor, " + SEZ),
      row("2", "Unit 2, Brigade, 5th Floor, " + SEZ),
    ]);
    const b = city.towers.find((t) => t.key === "brigade")!;
    // Floors 0..5 all exist; 1–4 are simply empty.
    expect(b.floors.map((f) => f.floor)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(b.floors.filter((f) => f.occupants.length === 0)).toHaveLength(4);
  });

  it("identifies the busiest single storey", () => {
    const city = buildCity([
      ...["a", "b", "c"].map((i) => row(i, `Unit ${i}, Pragya Accelerator, Ground Floor, ${SEZ}`)),
      row("d", "Unit d, Brigade, 3rd Floor, " + SEZ),
    ]);
    expect(city.stats.densestFloor).toEqual({
      tower: "Pragya Accelerator",
      floor: 0,
      count: 3,
    });
  });

  it("orders towers by occupancy, not by height", () => {
    const city = buildCity([
      row("tall", "Unit 1, GIFT Tower One, 24th Floor, " + SEZ),
      ...Array.from({ length: 5 }, (_, i) =>
        row(`s${i}`, `Unit ${i}, Signature Building, 2nd Floor, ${SEZ}`)
      ),
    ]);
    expect(city.towers[0].name).toBe("Signature Building");
    expect(city.towers[1].name).toBe("GIFT Tower One");
  });
});
