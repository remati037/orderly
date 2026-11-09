// "Svi oglasi" on /reklame: every ad that spent in the window, grouped into
// creatives. Ads are copied across ad sets under the same name, so one creative
// is judged on all its copies together. Money is in the account's own currency.
import type { InsightRow } from "./insights";
import { metricsOf, verdictOf, type Metrics, type Verdict } from "./report";

export const LIBRARY_DAYS = [7, 14, 30] as const;
export type LibraryDays = (typeof LIBRARY_DAYS)[number];

/** What the team should do with a creative, from its verdict and whether it still runs. */
export type AdAction = "push" | "revive" | "watch" | "stop" | "stopped" | "early" | "lead";

export interface AdCopy {
  ad_id: string;
  campaign_name: string | null;
  adset_name: string | null;
  status: string | null;
  metrics: Metrics;
  verdict: Verdict;
}

export interface Creative {
  key: string;
  ad_account_id: string;
  name: string;
  thumbnail_url: string | null;
  active: boolean;
  copies: number;
  active_copies: number;
  campaigns: string[];
  first_seen: string;
  last_spend: string;
  frequency: number;
  metrics: Metrics;
  verdict: Verdict;
  action: AdAction;
  instances: AdCopy[];
}

const latest = (rows: InsightRow[]) => rows.reduce((a, b) => (b.date > a.date ? b : a));

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
 * Creatives of one account for rows already cut to the window. `allRows` (the
 * stored history) gives the first day a creative ran and its current status.
 */
export function buildCreatives(rows: InsightRow[], allRows: InsightRow[], target: number | null, currency = "EUR"): Creative[] {
  const keyOf = (r: InsightRow) => `${r.ad_account_id}:${(r.ad_name ?? r.ad_id).trim().toLowerCase()}`;
  const groups = new Map<string, InsightRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const history = new Map<string, InsightRow[]>();
  for (const r of allRows) {
    const k = keyOf(r);
    const g = history.get(k);
    if (g) g.push(r);
    else history.set(k, [r]);
  }

  const creatives: Creative[] = [];
  for (const [key, list] of groups) {
    const metrics = metricsOf(list);
    if (metrics.spend === 0) continue;

    const past = history.get(key) ?? list;
    const byAd = new Map<string, InsightRow[]>();
    for (const r of past) {
      const g = byAd.get(r.ad_id);
      if (g) g.push(r);
      else byAd.set(r.ad_id, [r]);
    }

    const instances: AdCopy[] = [];
    for (const [adId, adRows] of byAd) {
      const inWindow = list.filter((r) => r.ad_id === adId);
      const m = metricsOf(inWindow);
      if (m.spend === 0) continue;
      const last = latest(adRows);
      instances.push({
        ad_id: adId,
        campaign_name: last.campaign_name,
        adset_name: last.adset_name,
        status: last.effective_status,
        metrics: m,
        verdict: verdictOf(m, target, currency),
      });
    }

    // A copy's current status is the one on its newest stored row.
    const statuses = [...byAd.values()].map((adRows) => latest(adRows).effective_status);
    const activeCopies = statuses.filter((s) => s === "ACTIVE").length;
    const newest = latest(list);
    const verdict = verdictOf(metrics, target, currency);
    const spentDays = list.filter((r) => r.spend > 0).map((r) => r.date).sort();

    creatives.push({
      key,
      ad_account_id: newest.ad_account_id,
      name: newest.ad_name ?? newest.ad_id,
      thumbnail_url: latest(past).thumbnail_url ?? newest.thumbnail_url,
      active: activeCopies > 0,
      copies: byAd.size,
      active_copies: activeCopies,
      campaigns: [...new Set(list.filter((r) => r.spend > 0).map((r) => r.campaign_name ?? r.campaign_id))],
      first_seen: past.reduce((d, r) => (r.date < d ? r.date : d), newest.date),
      last_spend: spentDays[spentDays.length - 1] ?? newest.date,
      // Frequency from each copy's newest day that delivered: a zero row for today says nothing.
      frequency: Math.max(0, ...[...byAd.values()].map((adRows) => {
        const delivered = adRows.filter((r) => r.impressions > 0);
        return delivered.length ? latest(delivered).frequency : 0;
      })),
      metrics,
      verdict,
      action: actionOf(verdict, activeCopies > 0),
      instances: instances.sort((a, b) => b.metrics.spend - a.metrics.spend),
    });
  }
  return creatives.sort((a, b) => b.metrics.spend - a.metrics.spend);
}
