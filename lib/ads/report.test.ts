import { describe, expect, it } from "vitest";
import type { InsightRow } from "./insights";
import { buildAccountReport, metricsOf, periodRange, verdictOf } from "./report";

const TODAY = "2026-11-04";

const row = (over: Partial<InsightRow>): InsightRow => ({
  ad_account_id: "acc", campaign_id: "c1", campaign_name: "Kampanja", adset_id: "s1", adset_name: "Set",
  ad_id: "a1", ad_name: "Oglas", date: TODAY, spend: 0, impressions: 0, inline_link_clicks: 0, frequency: 1, ctr: 1,
  purchases: 0, purchase_value: 0, add_to_cart: 0, initiate_checkout: 0, leads: 0, landing_page_views: 0,
  effective_status: "ACTIVE", thumbnail_url: null, ...over,
});

const noSite = () => ({ site_name: null, real_roas_site: null });
const verdict = (over: Partial<InsightRow>, target: number | null = 20) => verdictOf(metricsOf([row(over)]), target).level;

describe("periodRange", () => {
  it("compares 7 days with the 7 before", () => {
    expect(periodRange("7d", TODAY)).toEqual({ from: "2026-10-29", to: TODAY, prevFrom: "2026-10-22", prevTo: "2026-10-28" });
  });
  it("starts the month on the 1st and has no comparison past the stored data", () => {
    expect(periodRange("mtd", TODAY)).toEqual({ from: "2026-11-01", to: TODAY, prevFrom: null, prevTo: null });
    expect(periodRange("30d", TODAY).from).toBe("2026-10-06");
  });
  it("crosses a month boundary for yesterday", () => {
    expect(periodRange("yesterday", "2026-11-01").from).toBe("2026-10-31");
  });
});

describe("metricsOf", () => {
  it("derives rates from sums, not by averaging rows", () => {
    const m = metricsOf([
      row({ spend: 10, impressions: 1000, inline_link_clicks: 10, purchases: 1, purchase_value: 30 }),
      row({ ad_id: "a2", spend: 30, impressions: 3000, inline_link_clicks: 50, purchases: 1, purchase_value: 10 }),
    ]);
    expect(m).toMatchObject({ spend: 40, purchases: 2, cpa: 20, roas: 1, clicks: 60, cpm: 10 });
    expect(m.ctr).toBeCloseTo(0.015);
  });
});

describe("verdictOf", () => {
  it("waits for 1x target before judging", () => {
    expect(verdict({ spend: 19 })).toBe("low_data");
    expect(verdict({ spend: 15, purchases: 1, purchase_value: 40 })).toBe("low_data");
  });
  it("calls spend without a sale watch at 1x and bad at 2x target", () => {
    expect(verdict({ spend: 20 })).toBe("watch");
    expect(verdict({ spend: 40 })).toBe("bad");
  });
  it("grades CPA against the target", () => {
    expect(verdict({ spend: 40, purchases: 2, purchase_value: 100 })).toBe("good");
    expect(verdict({ spend: 60, purchases: 2, purchase_value: 100 })).toBe("watch");
    expect(verdict({ spend: 90, purchases: 2, purchase_value: 200 })).toBe("bad");
  });
  it("is bad when Meta reports less than was spent, even under the CPA limit", () => {
    expect(verdict({ spend: 40, purchases: 2, purchase_value: 20 })).toBe("bad");
  });
  it("does not punish lead campaigns for having no purchases", () => {
    expect(verdict({ spend: 100, leads: 10 })).toBe("lead");
  });
  it("never reads as good without a target", () => {
    expect(verdict({ spend: 100, purchases: 5, purchase_value: 500 }, null)).toBe("watch");
    expect(verdict({ spend: 100, purchases: 5, purchase_value: 50 }, null)).toBe("bad");
    expect(verdict({ spend: 100 }, null)).toBe("low_data");
  });
});

describe("buildAccountReport", () => {
  const range = periodRange("today", TODAY);

  it("splits the period from the one before and builds the tree", () => {
    const r = buildAccountReport([
      row({ spend: 30, purchases: 2, purchase_value: 90 }),
      row({ ad_id: "a2", adset_id: "s2", spend: 10 }),
      row({ date: "2026-11-03", spend: 50 }),
    ], range, 20, TODAY, noSite);
    expect(r.metrics.spend).toBe(40);
    expect(r.previous?.spend).toBe(50);
    expect(r.campaigns).toHaveLength(1);
    expect(r.campaigns[0].adsets.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(r.campaigns[0].adsets[0].ads[0].id).toBe("a1");
  });

  it("lists active campaigns without spend apart and drops idle paused ones", () => {
    const r = buildAccountReport([
      row({ campaign_id: "live", campaign_name: "Uživo" }),
      row({ campaign_id: "off", campaign_name: "Stara", effective_status: "PAUSED" }),
    ], range, 20, TODAY, noSite);
    expect(r.campaigns).toEqual([]);
    expect(r.idle_campaigns).toEqual(["Uživo"]);
  });

  it("marks a campaign paused from its newest status even when it spent", () => {
    const r = buildAccountReport([
      row({ spend: 5, effective_status: "PAUSED" }),
    ], range, 20, TODAY, noSite);
    expect(r.campaigns[0].active).toBe(false);
  });

  it("fills every day of the daily series", () => {
    const r = buildAccountReport([row({ spend: 5 })], range, 20, TODAY, noSite);
    expect(r.daily).toHaveLength(14);
    expect(r.daily[13]).toMatchObject({ date: TODAY, spend: 5 });
    expect(r.daily[0].spend).toBe(0);
  });

  it("keeps a healthy ad out of the worst list", () => {
    const r = buildAccountReport([
      row({ ad_id: "ok", spend: 30, purchases: 3, purchase_value: 150 }),
      row({ ad_id: "ok2", spend: 40, purchases: 3, purchase_value: 150 }),
      row({ ad_id: "dead", spend: 50 }),
    ], range, 20, TODAY, noSite);
    expect(r.best_ads.map((a) => a.ad_id)).toEqual(["ok", "ok2"]);
    expect(r.worst_ads.map((a) => a.ad_id)).toEqual(["dead"]);
  });
});
