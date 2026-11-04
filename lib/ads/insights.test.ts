import { describe, expect, it } from "vitest";
import { evaluateAlerts, isFatigued, parseInsightRow, rankCreatives, type InsightRow } from "./insights";

const row = (over: Partial<InsightRow>): InsightRow => ({
  ad_account_id: "acc", campaign_id: "c1", campaign_name: "Kampanja", adset_id: "s1", adset_name: "Set",
  ad_id: "a1", ad_name: "Oglas", date: "2026-11-04", spend: 0, impressions: 0, inline_link_clicks: 0, frequency: 1, ctr: 1,
  purchases: 0, purchase_value: 0, add_to_cart: 0, initiate_checkout: 0, leads: 0, landing_page_views: 0, effective_status: "ACTIVE", thumbnail_url: null, ...over,
});

const TODAY = "2026-11-04";
const YESTERDAY = "2026-11-03";

describe("parseInsightRow", () => {
  const base = { campaign_id: "c", ad_id: "a", date_start: TODAY };

  it("does not add up overlapping purchase types", () => {
    const parsed = parseInsightRow({
      ...base,
      actions: [
        { action_type: "purchase", value: "3" },
        { action_type: "omni_purchase", value: "3" },
        { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
      ],
      action_values: [{ action_type: "purchase", value: "141.50" }],
    }, "acc");
    expect(parsed.purchases).toBe(3);
    expect(parsed.purchase_value).toBe(141.5);
  });

  it("falls back to the pixel purchase type", () => {
    const parsed = parseInsightRow({ ...base, actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "2" }] }, "acc");
    expect(parsed.purchases).toBe(2);
  });

  it("reads leads and landing page views", () => {
    const parsed = parseInsightRow({ ...base, actions: [
      { action_type: "lead", value: "4" },
      { action_type: "onsite_conversion.lead_grouped", value: "4" },
      { action_type: "landing_page_view", value: "9" },
    ] }, "acc");
    expect(parsed).toMatchObject({ leads: 4, landing_page_views: 9 });
  });

  it("treats missing metrics as zero and takes status from the ad list", () => {
    const parsed = parseInsightRow(base, "acc", { status: "PAUSED", thumbnail: "t.jpg" });
    expect(parsed).toMatchObject({ spend: 0, purchases: 0, effective_status: "PAUSED", thumbnail_url: "t.jpg" });
  });
});

describe("isFatigued", () => {
  const y = row({ date: YESTERDAY, frequency: 1.5, ctr: 2 });
  it("needs frequency up and CTR down on enough impressions", () => {
    expect(isFatigued(row({ impressions: 2000, frequency: 1.8, ctr: 1.5 }), y)).toBe(true);
    expect(isFatigued(row({ impressions: 2000, frequency: 1.8, ctr: 2.5 }), y)).toBe(false);
    expect(isFatigued(row({ impressions: 200, frequency: 1.8, ctr: 1.5 }), y)).toBe(false);
    expect(isFatigued(row({ impressions: 2000, frequency: 1.8, ctr: 1.5 }), undefined)).toBe(false);
  });
});

describe("rankCreatives", () => {
  const min = () => 10;

  it("ranks by CPA, puts spend without purchase last, skips low spend and inactive ads", () => {
    const { best, worst } = rankCreatives([
      row({ ad_id: "cheap", spend: 20, purchases: 2 }),
      row({ ad_id: "dear", spend: 60, purchases: 1 }),
      row({ ad_id: "none", spend: 30 }),
      row({ ad_id: "small", spend: 5, purchases: 1 }),
      row({ ad_id: "paused", spend: 50, purchases: 5, effective_status: "PAUSED" }),
    ], TODAY, YESTERDAY, min, 1);
    expect(best.map((c) => c.ad_id)).toEqual(["cheap"]);
    expect(worst.map((c) => c.ad_id)).toEqual(["none"]);
  });

  it("never lists one ad as both best and worst", () => {
    const { best, worst } = rankCreatives([row({ ad_id: "only", spend: 20, purchases: 1 })], TODAY, YESTERDAY, min);
    expect(best).toHaveLength(1);
    expect(worst).toHaveLength(0);
  });

  it("uses the status of the latest day and weights CTR by impressions", () => {
    const { best } = rankCreatives([
      row({ ad_id: "x", date: YESTERDAY, spend: 10, purchases: 1, impressions: 100, ctr: 1, effective_status: "PAUSED" }),
      row({ ad_id: "x", spend: 10, impressions: 300, ctr: 3 }),
    ], TODAY, YESTERDAY, min);
    expect(best[0].ctr).toBeCloseTo(2.5);
  });
});

describe("evaluateAlerts", () => {
  const input = { accountName: "VD", accountId: "acc", accountStatus: 1, rows: [], recent: [], target: 20 };
  const keys = (over: Partial<Parameters<typeof evaluateAlerts>[0]>) =>
    evaluateAlerts({ ...input, ...over }).map((a) => a.key);

  it("alerts on spend over 2x target without a purchase", () => {
    expect(keys({ rows: [row({ spend: 41 })] })).toEqual(["no_purchase:c1"]);
    expect(keys({ rows: [row({ spend: 40 })] })).toEqual([]);
    expect(keys({ rows: [row({ spend: 500 })], target: null })).toEqual([]);
  });

  it("alerts on CPA over 2x the 3-day average", () => {
    const recent = [row({ date: YESTERDAY, spend: 100, purchases: 10 })];
    expect(keys({ rows: [row({ spend: 21, purchases: 1 })], recent })).toEqual(["cpa:c1"]);
    expect(keys({ rows: [row({ spend: 20, purchases: 1 })], recent })).toEqual([]);
    expect(keys({ rows: [row({ spend: 21, purchases: 1 })] })).toEqual([]);
  });

  it("alerts on a rejected ad and a limited account", () => {
    expect(keys({ rows: [row({ effective_status: "DISAPPROVED" })] })).toEqual(["ad:a1"]);
    expect(keys({ accountStatus: 2 })).toEqual(["account:acc"]);
  });
});
