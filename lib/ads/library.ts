// "Svi oglasi" on /reklame: like Ads Manager, every campaign that spent in the
// window, then its ad sets, then its ads. Each level gets its own verdict and
// what to do with it. Money is in the account's own currency.
import type { InsightRow } from "./insights";
import { metricsOf, verdictOf, type Metrics, type Verdict } from "./report";

export const LIBRARY_DAYS = [7, 14, 30] as const;
export type LibraryDays = (typeof LIBRARY_DAYS)[number];

/** What the team should do, from the verdict and whether it still runs. */
export type AdAction = "push" | "revive" | "watch" | "stop" | "stopped" | "early" | "lead";

interface NodeBase {
  id: string;
  name: string;
  active: boolean;
  first_seen: string;
  metrics: Metrics;
  verdict: Verdict;
  action: AdAction;
}
export interface LibraryAd extends NodeBase { status: string | null; thumbnail_url: string | null; frequency: number }
export interface LibraryAdset extends NodeBase { active_ads: number; ads: LibraryAd[] }
export interface LibraryCampaign extends NodeBase { ad_account_id: string; active_ads: number; ad_count: number; adsets: LibraryAdset[] }

const latest = (rows: InsightRow[]) => rows.reduce((a, b) => (b.date > a.date ? b : a));
const firstDay = (rows: InsightRow[]) => rows.reduce((d, r) => (r.date < d ? r.date : d), rows[0].date);
const bySpend = <T extends { metrics: Metrics }>(a: T, b: T) => b.metrics.spend - a.metrics.spend;

function groupBy(rows: InsightRow[], key: (r: InsightRow) => string): Map<string, InsightRow[]> {
  const groups = new Map<string, InsightRow[]>();
  for (const r of rows) {
    const k = key(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return groups;
}

export function actionOf(verdict: Verdict, active: boolean): AdAction {
  switch (verdict.level) {
    case "good": return active ? "push" : "revive";
    case "bad": return active ? "stop" : "stopped";
    case "watch": return "watch";
    case "lead": return "lead";
    default: return "early";
  }
}

/**
 * Campaign → ad set → ad tree of one account for rows already cut to the window.
 * `allRows` (the stored history) gives each ad's current status and first day.
 */
export function buildCampaigns(rows: InsightRow[], allRows: InsightRow[], target: number | null, currency = "EUR"): LibraryCampaign[] {
  const history = groupBy(allRows, (r) => r.ad_id);
  // An ad's current status is the one on its newest stored row.
  const isActive = (adId: string) => latest(history.get(adId) ?? rows.filter((r) => r.ad_id === adId)).effective_status === "ACTIVE";
  const judge = (m: Metrics, active: boolean) => {
    const verdict = verdictOf(m, target, currency);
    return { verdict, action: actionOf(verdict, active) };
  };

  const campaigns: LibraryCampaign[] = [];
  for (const [campaignId, campaignRows] of groupBy(rows, (r) => r.campaign_id)) {
    const metrics = metricsOf(campaignRows);
    if (metrics.spend === 0) continue;

    const adsets: LibraryAdset[] = [];
    for (const [adsetId, setRows] of groupBy(campaignRows, (r) => r.adset_id ?? "")) {
      const setMetrics = metricsOf(setRows);
      if (setMetrics.spend === 0) continue;

      const ads: LibraryAd[] = [];
      for (const [adId, adRows] of groupBy(setRows, (r) => r.ad_id)) {
        const m = metricsOf(adRows);
        if (m.spend === 0) continue;
        const past = history.get(adId) ?? adRows;
        // Frequency from the newest day that delivered: a zero row for today says nothing.
        const delivered = past.filter((r) => r.impressions > 0);
        const active = isActive(adId);
        ads.push({
          id: adId,
          name: latest(adRows).ad_name ?? adId,
          active,
          status: latest(past).effective_status,
          thumbnail_url: latest(past).thumbnail_url ?? latest(adRows).thumbnail_url,
          frequency: delivered.length ? latest(delivered).frequency : 0,
          first_seen: firstDay(past),
          metrics: m,
          ...judge(m, active),
        });
      }

      const activeAds = ads.filter((a) => a.active).length;
      adsets.push({
        id: adsetId,
        name: latest(setRows).adset_name ?? adsetId,
        active: activeAds > 0,
        active_ads: activeAds,
        first_seen: ads.reduce((d, a) => (a.first_seen < d ? a.first_seen : d), firstDay(setRows)),
        metrics: setMetrics,
        ...judge(setMetrics, activeAds > 0),
        ads: ads.sort(bySpend),
      });
    }

    const activeAds = adsets.reduce((n, s) => n + s.active_ads, 0);
    campaigns.push({
      id: campaignId,
      ad_account_id: campaignRows[0].ad_account_id,
      name: latest(campaignRows).campaign_name ?? campaignId,
      active: activeAds > 0,
      active_ads: activeAds,
      ad_count: adsets.reduce((n, s) => n + s.ads.length, 0),
      first_seen: adsets.reduce((d, s) => (s.first_seen < d ? s.first_seen : d), firstDay(campaignRows)),
      metrics,
      ...judge(metrics, activeAds > 0),
      adsets: adsets.sort(bySpend),
    });
  }
  return campaigns.sort(bySpend);
}
