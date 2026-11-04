import { describe, expect, it } from "vitest";
import type { InsightRow } from "./insights";
import { buildAccountReport, formatMoney, leadCount, linkChip, metricsOf, periodRange, trendChip, verdictOf } from "./report";

const TODAY = "2026-11-04";
const YESTERDAY = "2026-11-03";

const row = (over: Partial<InsightRow>): InsightRow => ({
  ad_account_id: "acc", campaign_id: "c1", campaign_name: "Kampanja", adset_id: "s1", adset_name: "Set",
  ad_id: "a1", ad_name: "Oglas", date: TODAY, spend: 0, impressions: 0, inline_link_clicks: 0, frequency: 1, ctr: 1,
  purchases: 0, purchase_value: 0, add_to_cart: 0, initiate_checkout: 0, leads: 0, landing_page_views: 0,
  effective_status: "ACTIVE", thumbnail_url: null, ...over,
});

const noSite = () => ({ site_name: null, real_roas_site: null });
const verdict = (over: Partial<InsightRow>, target: number | null = 20) => verdictOf(metricsOf([row(over)]), target).level;

describe("periodRange", () => {
  it("compares 7 full days with the 7 before", () => {
    expect(periodRange("7d", TODAY)).toEqual({ from: "2026-10-28", to: YESTERDAY, prevFrom: "2026-10-21", prevTo: "2026-10-27" });
  });
  it("starts the month on the 1st and has no comparison past the stored data", () => {
    expect(periodRange("mtd", TODAY)).toEqual({ from: "2026-11-01", to: TODAY, prevFrom: null, prevTo: null });
    expect(periodRange("30d", TODAY)).toMatchObject({ from: "2026-10-05", to: YESTERDAY });
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

  it("charts full days only, ending yesterday", () => {
    const r = buildAccountReport([row({ spend: 5 }), row({ date: YESTERDAY, spend: 7 })], range, 20, TODAY, noSite);
    expect(r.daily).toHaveLength(14);
    expect(r.daily[13]).toMatchObject({ date: YESTERDAY, spend: 7 });
    expect(r.daily[0].spend).toBe(0);
  });

  it("ranks ads on the last 7 full days, whatever period is chosen", () => {
    const r = buildAccountReport([
      row({ ad_id: "ok", date: YESTERDAY, spend: 30, purchases: 3, purchase_value: 150 }),
      row({ ad_id: "ok2", date: "2026-10-30", spend: 40, purchases: 3, purchase_value: 150 }),
      row({ ad_id: "dead", date: YESTERDAY, spend: 50 }),
      row({ ad_id: "only_today", spend: 90, purchases: 9, purchase_value: 900 }),
      row({ ad_id: "too_old", date: "2026-10-20", spend: 90, purchases: 9, purchase_value: 900 }),
    ], range, 20, TODAY, noSite);
    expect(r.best_ads.map((a) => a.ad_id)).toEqual(["ok", "ok2"]);
    expect(r.worst_ads.map((a) => a.ad_id)).toEqual(["dead"]);
  });

  it("gives the same verdict for any period, from the last 7 full days", () => {
    const rows = [
      row({ date: YESTERDAY, spend: 40, purchases: 4, purchase_value: 200 }),
      row({ spend: 100 }),
    ];
    const today = buildAccountReport(rows, range, 20, TODAY, noSite);
    expect(today.campaigns[0].verdict.level).toBe("good");
    expect(today.verdict.level).toBe("good");
  });

  it("does not grade a campaign that only started today", () => {
    const r = buildAccountReport([row({ spend: 100 })], range, 20, TODAY, noSite);
    expect(r.campaigns[0].verdict.level).toBe("low_data");
  });

  it("builds the card from yesterday and the 7 full days, in the given currency", () => {
    const r = buildAccountReport([
      row({ spend: 999 }),
      row({ date: YESTERDAY, spend: 10, purchases: 1, purchase_value: 50 }),
      row({ date: "2026-10-29", spend: 30, purchases: 1, purchase_value: 30 }),
      row({ date: "2026-10-27", spend: 500 }),
    ], range, 20, TODAY, () => ({ site_name: "Sajt", real_roas_site: 2 }), "USD");
    expect(r.card.yesterday).toMatchObject({ spend: 10, roas: 5 });
    expect(r.card.week).toMatchObject({ spend: 40, purchases: 2 });
    expect(r.card.link.label).toBe("Povezano sa sajtom");
    expect(r.card.top_campaigns).toEqual([{ name: "Kampanja", spend: 10 }]);
  });
});

describe("trendChip", () => {
  const day = (roas: number | null) => metricsOf([row(roas === null ? {} : { spend: 10, purchase_value: 10 * roas })]);
  const label = (...r: (number | null)[]) => trendChip(r.map(day)).label;

  it("calls out the best and worst day of the week", () => {
    expect(label(2, 1, 3, 1, 5)).toBe("Najbolji dan u nedelji");
    expect(label(2, 3, 2, 4, 1)).toBe("Najslabiji dan u nedelji");
  });
  it("counts consecutive falling days before anything else", () => {
    expect(label(5, 4, 3)).toBe("Drugi dan pada");
    expect(label(5, 4, 3, 2)).toBe("Treći dan pada");
  });
  it("compares a middling day with the week", () => {
    expect(label(1, 5, 1, 2, 3.5)).toBe("Jak dan");
    expect(label(4, 5, 1, 5, 2)).toBe("Slabiji dan");
    expect(label(3, 1, 4, 2, 3)).toBe("U proseku nedelje");
  });
  it("says so when yesterday had no spend", () => {
    expect(label(2, 3, null)).toBe("Juče bez potrošnje");
  });
});

describe("linkChip", () => {
  it("reports how much can be checked against Orderly", () => {
    expect(linkChip(3, 3).tone).toBe("good");
    expect(linkChip(1, 3).tone).toBe("watch");
    expect(linkChip(0, 3).tone).toBe("bad");
    expect(linkChip(0, 0).tone).toBe("neutral");
  });
});

describe("formatMoney", () => {
  it("writes each currency the way the team reads it", () => {
    expect(formatMoney(57.21, "USD")).toBe("$57,21");
    expect(formatMoney(69.68, "EUR")).toBe("69,68 €");
  });
});

describe("leadCount", () => {
  it("declines the word", () => {
    expect([1, 2, 5, 11, 12, 21, 22].map(leadCount)).toEqual(["1 lead", "2 leada", "5 leadova", "11 leadova", "12 leadova", "21 lead", "22 leada"]);
  });
});
