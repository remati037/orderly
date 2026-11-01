import { describe, expect, it } from "vitest";
import { computeBonus, siteShare, type BonusProgram } from "./program";

const program: BonusProgram = {
  name: "Test",
  from: "2026-11-01",
  to: "2026-11-30",
  people: 4,
  site_shares: { partner: 0.5 },
  tiers: [
    { from: 100000, amount: 6000 },
    { from: 80000, amount: 2400 },
    { from: 90000, amount: 2700 },
    { from: 110000, amount: 6800 },
    { from: 200000, amount: 30000 },
  ],
};

describe("computeBonus", () => {
  it("pays nothing below the first tier", () => {
    expect(computeBonus(program, 79999)).toEqual({ tierIndex: -1, rate: 0, total: 0, perPerson: 0 });
  });

  it("matches the table exactly at each threshold", () => {
    expect(computeBonus(program, 80000).total).toBeCloseTo(2400);
    expect(computeBonus(program, 100000).total).toBeCloseTo(6000);
    expect(computeBonus(program, 110000).total).toBeCloseTo(6800);
    expect(computeBonus(program, 100000).perPerson).toBeCloseTo(1500);
  });

  it("applies the reached tier's percentage between thresholds", () => {
    const r = computeBonus(program, 95000);
    expect(r.tierIndex).toBe(1);
    expect(r.rate).toBeCloseTo(0.03);
    expect(r.total).toBeCloseTo(2850);
  });

  it("caps at the last tier", () => {
    expect(computeBonus(program, 250000).total).toBe(30000);
    expect(computeBonus(program, 250000).perPerson).toBe(7500);
  });
});

describe("siteShare", () => {
  it("counts partners at their share and everyone else fully", () => {
    expect(siteShare(program, "partner")).toBe(0.5);
    expect(siteShare(program, "own")).toBe(1);
  });
});
