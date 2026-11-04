// Per-account report behind /reklame: metrics for a chosen period with the period
// before it, a plain verdict, and the campaign → ad set → ad tree. Base currency.
import { cpa, rankCreatives, ratio, type CreativeRow, type InsightRow } from "./insights";

export type PeriodKey = "today" | "yesterday" | "7d" | "mtd" | "30d";
export const PERIODS: PeriodKey[] = ["today", "yesterday", "7d", "mtd", "30d"];

export interface PeriodRange {
  from: string;
  to: string;
  /** The equally long period right before, when it fits in the stored 30 days. */
  prevFrom: string | null;
  prevTo: string | null;
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function periodRange(key: PeriodKey, today: string): PeriodRange {
  switch (key) {
    case "today":
      return { from: today, to: today, prevFrom: addDays(today, -1), prevTo: addDays(today, -1) };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1), prevFrom: addDays(today, -2), prevTo: addDays(today, -2) };
    case "7d":
      return { from: addDays(today, -6), to: today, prevFrom: addDays(today, -13), prevTo: addDays(today, -7) };
    case "mtd":
      return { from: `${today.slice(0, 7)}-01`, to: today, prevFrom: null, prevTo: null };
    case "30d":
      return { from: addDays(today, -29), to: today, prevFrom: null, prevTo: null };
  }
}

export interface Metrics {
  spend: number;
  purchases: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  landing_page_views: number;
  add_to_cart: number;
  initiate_checkout: number;
  leads: number;
  cpl: number | null;
}

export function metricsOf(rows: InsightRow[]): Metrics {
  const sum = (f: (r: InsightRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const spend = sum((r) => r.spend);
  const purchases = sum((r) => r.purchases);
  const revenue = sum((r) => r.purchase_value);
  const impressions = sum((r) => r.impressions);
  const clicks = sum((r) => r.inline_link_clicks);
  const leads = sum((r) => r.leads);
  return {
    spend,
    purchases,
    revenue,
    cpa: cpa(spend, purchases),
    roas: ratio(revenue, spend),
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    landing_page_views: sum((r) => r.landing_page_views),
    add_to_cart: sum((r) => r.add_to_cart),
    initiate_checkout: sum((r) => r.initiate_checkout),
    leads,
    cpl: leads > 0 ? spend / leads : null,
  };
}

export type VerdictLevel = "good" | "watch" | "bad" | "low_data" | "lead" | "idle";
export interface Verdict { level: VerdictLevel; reason: string }

const eur = (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Plain verdict against the account's CPA limit. Thresholds follow M4: under 1x
 * target there isn't enough to judge (Č12), 2x target without a sale or a CPA
 * over 2x target is bad (P2, P3). So is Meta reporting less revenue than was spent.
 */
export function verdictOf(m: Metrics, target: number | null): Verdict {
  if (m.spend === 0) return { level: "idle", reason: "Nema potrošnje" };
  if (m.purchases === 0 && m.leads > 0)
    return { level: "lead", reason: `${m.leads} leadova po ${eur(m.cpl!)}` };

  if (!target) {
    if (m.purchases === 0) return { level: "low_data", reason: `${eur(m.spend)} potrošeno, još nema prodaje` };
    return m.roas !== null && m.roas < 1
      ? { level: "bad", reason: `ROAS ${m.roas.toFixed(2)}x, Meta prijavljuje manje od potrošnje` }
      : { level: "watch", reason: `CPA ${eur(m.cpa!)}, prag nije određen` };
  }

  if (m.purchases === 0) {
    if (m.spend >= 2 * target) return { level: "bad", reason: `${eur(m.spend)} potrošeno bez ijedne prodaje` };
    if (m.spend >= target) return { level: "watch", reason: `${eur(m.spend)} potrošeno, još nema prodaje` };
    return { level: "low_data", reason: `Tek ${eur(m.spend)} potrošeno, rano za ocenu` };
  }

  if (m.spend < target && m.purchases < 2) return { level: "low_data", reason: `Tek ${eur(m.spend)} potrošeno, rano za ocenu` };
  if (m.cpa! > 2 * target) return { level: "bad", reason: `CPA ${eur(m.cpa!)}, više od duplo iznad praga ${eur(target)}` };
  if (m.roas !== null && m.roas < 1) return { level: "bad", reason: `ROAS ${m.roas.toFixed(2)}x, Meta prijavljuje manje od potrošnje` };
  if (m.cpa! > target) return { level: "watch", reason: `CPA ${eur(m.cpa!)} iznad praga ${eur(target)}` };
  return { level: "good", reason: `CPA ${eur(m.cpa!)} ispod praga ${eur(target)}` };
}

export interface AdReport {
  id: string;
  name: string;
  status: string | null;
  thumbnail_url: string | null;
  frequency: number;
  metrics: Metrics;
  verdict: Verdict;
}
export interface AdsetReport { id: string; name: string; metrics: Metrics; verdict: Verdict; ads: AdReport[] }
export interface CampaignReport {
  id: string;
  name: string;
  active: boolean;
  site_name: string | null;
  real_roas_site: number | null;
  metrics: Metrics;
  previous: Metrics | null;
  verdict: Verdict;
  adsets: AdsetReport[];
}
export interface DayPoint { date: string; spend: number; purchases: number; revenue: number }
export interface AccountReport {
  metrics: Metrics;
  previous: Metrics | null;
  verdict: Verdict;
  daily: DayPoint[];
  campaigns: CampaignReport[];
  idle_campaigns: string[];
  best_ads: (CreativeRow & { verdict: Verdict })[];
  worst_ads: (CreativeRow & { verdict: Verdict })[];
}

const DAILY_DAYS = 14;
const FALLBACK_MIN_SPEND = 10;

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

const latest = (rows: InsightRow[]) => rows.reduce((a, b) => (b.date > a.date ? b : a));
const bySpend = <T extends { metrics: Metrics }>(a: T, b: T) => b.metrics.spend - a.metrics.spend;

/** Report for one account. `rows` are its stored rows, `siteOf` its campaign → site info. */
export function buildAccountReport(
  rows: InsightRow[],
  range: PeriodRange,
  target: number | null,
  today: string,
  siteOf: (campaignId: string) => { site_name: string | null; real_roas_site: number | null }
): AccountReport {
  const inRange = rows.filter((r) => r.date >= range.from && r.date <= range.to);
  const inPrev = range.prevFrom ? rows.filter((r) => r.date >= range.prevFrom! && r.date <= range.prevTo!) : null;
  const metrics = metricsOf(inRange);

  const campaigns: CampaignReport[] = [];
  const idle: string[] = [];
  for (const [id, all] of groupBy(rows, (r) => r.campaign_id)) {
    const current = inRange.filter((r) => r.campaign_id === id);
    const m = metricsOf(current);
    // An ad's current status is the one on its newest row.
    const active = [...groupBy(all, (r) => r.ad_id).values()].some((ad) => latest(ad).effective_status === "ACTIVE");
    const name = latest(all).campaign_name ?? id;
    if (m.spend === 0) {
      if (active) idle.push(name);
      continue;
    }

    const adsets: AdsetReport[] = [...groupBy(current, (r) => r.adset_id ?? "").entries()].map(([adsetId, setRows]) => {
      const setMetrics = metricsOf(setRows);
      const ads: AdReport[] = [...groupBy(setRows, (r) => r.ad_id).entries()].map(([adId, adRows]) => {
        const last = latest(adRows);
        const adMetrics = metricsOf(adRows);
        return {
          id: adId,
          name: last.ad_name ?? adId,
          status: latest(all.filter((r) => r.ad_id === adId)).effective_status,
          thumbnail_url: last.thumbnail_url,
          frequency: last.frequency,
          metrics: adMetrics,
          verdict: verdictOf(adMetrics, target),
        };
      });
      return {
        id: adsetId,
        name: latest(setRows).adset_name ?? adsetId,
        metrics: setMetrics,
        verdict: verdictOf(setMetrics, target),
        ads: ads.filter((a) => a.metrics.spend > 0).sort(bySpend),
      };
    });

    campaigns.push({
      id,
      name,
      active,
      ...siteOf(id),
      metrics: m,
      previous: inPrev ? metricsOf(inPrev.filter((r) => r.campaign_id === id)) : null,
      verdict: verdictOf(m, target),
      adsets: adsets.sort(bySpend),
    });
  }

  const daily: DayPoint[] = [];
  for (let i = DAILY_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const m = metricsOf(rows.filter((r) => r.date === date));
    daily.push({ date, spend: m.spend, purchases: m.purchases, revenue: m.revenue });
  }

  const ranked = rankCreatives(inRange, today, addDays(today, -1), () => target ?? FALLBACK_MIN_SPEND, 5, rows);
  const withVerdict = (c: CreativeRow) => ({
    ...c,
    verdict: verdictOf(metricsOf(inRange.filter((r) => r.ad_id === c.ad_id)), target),
  });

  return {
    metrics,
    previous: inPrev ? metricsOf(inPrev) : null,
    verdict: verdictOf(metrics, target),
    daily,
    campaigns: campaigns.sort(bySpend),
    idle_campaigns: idle,
    best_ads: ranked.best.map(withVerdict),
    // An ad doing fine isn't "worst" just because the account has few ads.
    worst_ads: ranked.worst.map(withVerdict).filter((c) => c.verdict.level === "bad" || c.verdict.level === "watch"),
  };
}
