import { describe, expect, it } from "vitest";
import { chartColor, orderForSeparation } from "./chart-color";

describe("chartColor", () => {
  it("leaves colours already in the readable band untouched", () => {
    expect(chartColor("#1B6EF3")).toBe("#1b6ef3");
    expect(chartColor("#e5552a")).toBe("#e5552a");
  });
  it("darkens colours too light for a white surface, keeping the hue", () => {
    const y = chartColor("#fed300");
    expect(y).not.toBe("#fed300");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(y.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b); // still yellow: red+green high, blue low
    expect(g).toBeGreaterThan(b);
  });
  it("falls back for missing or invalid input", () => {
    expect(chartColor(null)).toBe("#71717A");
    expect(chartColor("nope", "#000000")).toBe("#000000");
  });
});

describe("orderForSeparation", () => {
  it("never puts the colour-blind-confusable yellow and green next to each other", () => {
    const sites = ["#fed300", "#0ac743", "#1B6EF3", "#e5552a"].map((c) => chartColor(c));
    const order = orderForSeparation(sites, (c) => c);
    const iy = order.indexOf(chartColor("#fed300"));
    const ig = order.indexOf(chartColor("#0ac743"));
    expect(Math.abs(iy - ig)).toBeGreaterThan(1);
    expect([...order].sort()).toEqual([...sites].sort());
  });
  it("keeps short lists as they are", () => {
    expect(orderForSeparation(["#000000", "#ffffff"], (c) => c)).toEqual(["#000000", "#ffffff"]);
  });
});
