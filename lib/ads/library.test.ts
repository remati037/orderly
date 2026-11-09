import { describe, expect, it } from "vitest";
import type { InsightRow } from "./insights";
import { actionOf, buildCreatives } from "./library";

const row = (over: Partial<InsightRow>): InsightRow => ({
  ad_account_id: "acc", campaign_id: "c1", campaign_name: "Kampanja", adset_id: "s1", adset_name: "Set",
  ad_id: "a1", ad_name: "Oglas", date: "2026-11-08", spend: 0, impressions: 0, inline_link_clicks: 0, frequency: 1, ctr: 1,
  purchases: 0, purchase_value: 0, add_to_cart: 0, initiate_checkout: 0, leads: 0, landing_page_views: 0,
  effective_status: "ACTIVE", thumbnail_url: null, ...over,
});

describe("buildCreatives", () => {
  it("judges copies of one creative together, across ad sets", () => {
    const rows = [
      row({ ad_id: "a1", adset_name: "Set A", spend: 30, purchases: 2, purchase_value: 120 }),
      row({ ad_id: "a2", adset_id: "s2", adset_name: "Set B", ad_name: " oglas ", spend: 20, purchases: 1, purchase_value: 60 }),
      row({ ad_id: "a3", ad_name: "Drugi", spend: 5 }),
    ];
    const [first, second] = buildCreatives(rows, rows, 20);
    expect(first).toMatchObject({ name: "Oglas", copies: 2, active_copies: 2, action: "push" });
    expect(first.metrics).toMatchObject({ spend: 50, purchases: 3 });
    expect(first.instances.map((i) => i.ad_id)).toEqual(["a1", "a2"]);
    expect(second).toMatchObject({ name: "Drugi", action: "early" });
  });

  it("takes status and first day from history outside the window", () => {
    const old = row({ date: "2026-10-20", spend: 10, effective_status: "ACTIVE" });
    const now = row({ date: "2026-11-08", spend: 50, effective_status: "PAUSED" });
    const [c] = buildCreatives([now], [old, now], 20);
    expect(c).toMatchObject({ first_seen: "2026-10-20", active: false, action: "stopped" });
  });

  it("leaves out creatives with no spend in the window", () => {
    expect(buildCreatives([row({ spend: 0, impressions: 50 })], [], 20)).toEqual([]);
  });
});

describe("actionOf", () => {
  it("tells a paused winner apart from a running one", () => {
    expect(actionOf({ level: "good", reason: "" }, false)).toBe("revive");
    expect(actionOf({ level: "bad", reason: "" }, true)).toBe("stop");
    expect(actionOf({ level: "idle", reason: "" }, true)).toBe("early");
  });
});
