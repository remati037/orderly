import { describe, expect, it } from "vitest";
import type { InsightRow } from "./insights";
import { actionOf, buildCampaigns, libraryRange } from "./library";

const row = (over: Partial<InsightRow>): InsightRow => ({
  ad_account_id: "acc", campaign_id: "c1", campaign_name: "Kampanja", adset_id: "s1", adset_name: "Set",
  ad_id: "a1", ad_name: "Oglas", date: "2026-11-08", spend: 0, impressions: 100, inline_link_clicks: 0, frequency: 1, ctr: 1,
  purchases: 0, purchase_value: 0, add_to_cart: 0, initiate_checkout: 0, leads: 0, landing_page_views: 0,
  effective_status: "ACTIVE", thumbnail_url: null, ...over,
});

describe("buildCampaigns", () => {
  it("nests ad sets and ads under campaigns, each judged on its own", () => {
    const rows = [
      row({ ad_id: "a1", spend: 30, purchases: 3, purchase_value: 150 }),
      row({ ad_id: "a2", ad_name: "Drugi", spend: 45 }),
      row({ ad_id: "a3", adset_id: "s2", adset_name: "Set B", spend: 5 }),
      row({ ad_id: "a4", campaign_id: "c2", campaign_name: "Mala", spend: 2 }),
    ];
    const [big, small] = buildCampaigns(rows, rows, 20);
    expect(big).toMatchObject({ name: "Kampanja", ad_count: 3, active_ads: 3 });
    expect(big.metrics).toMatchObject({ spend: 80, purchases: 3 });
    expect(big.adsets.map((s) => s.name)).toEqual(["Set", "Set B"]);
    expect(big.adsets[0].ads.map((a) => [a.name, a.action])).toEqual([["Drugi", "stop"], ["Oglas", "push"]]);
    expect(small).toMatchObject({ name: "Mala", action: "early" });
  });

  it("takes status, first day and frequency from history outside the window", () => {
    const old = row({ date: "2026-10-20", spend: 10, frequency: 2.5 });
    const now = row({ date: "2026-11-08", spend: 50, frequency: 3.1 });
    const today = row({ date: "2026-11-09", impressions: 0, frequency: 0, effective_status: "PAUSED" });
    const [c] = buildCampaigns([now], [old, now, today], 20);
    expect(c).toMatchObject({ first_seen: "2026-10-20", active: false, action: "stopped" });
    expect(c.adsets[0].ads[0].frequency).toBe(3.1);
  });

  it("shows one day but judges on the verdict rows", () => {
    const week = [row({ date: "2026-11-05", spend: 60, purchases: 6 }), row({ date: "2026-11-08", spend: 30 })];
    const today = [row({ date: "2026-11-09", spend: 30 })];
    const [c] = buildCampaigns(today, [...week, ...today], 20, "EUR", week);
    expect(c.metrics).toMatchObject({ spend: 30, purchases: 0 });
    expect(c.action).toBe("push");
    expect(c.adsets[0].ads[0].action).toBe("push");
  });

  it("leaves out what did not spend in the window", () => {
    expect(buildCampaigns([row({ spend: 0 })], [], 20)).toEqual([]);
  });
});

describe("actionOf", () => {
  it("tells a paused winner apart from a running one", () => {
    expect(actionOf({ level: "good", reason: "" }, false)).toBe("revive");
    expect(actionOf({ level: "bad", reason: "" }, true)).toBe("stop");
    expect(actionOf({ level: "idle", reason: "" }, true)).toBe("early");
  });
});

describe("libraryRange", () => {
  it("keeps single days apart from full-day windows ending yesterday", () => {
    expect(libraryRange("today", "2026-11-09")).toEqual({ from: "2026-11-09", to: "2026-11-09" });
    expect(libraryRange("yesterday", "2026-11-01")).toEqual({ from: "2026-10-31", to: "2026-10-31" });
    expect(libraryRange("14d", "2026-11-09")).toEqual({ from: "2026-10-26", to: "2026-11-08" });
  });
});
