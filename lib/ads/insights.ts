// Pure logic behind /reklame: parsing Meta insights, campaign rows, creative
// rankings and alerts. Money here is already in base currency unless noted.

interface ActionValue { action_type: string; value: string }

export interface GraphInsightRow {
  campaign_id: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpm?: string;
  actions?: ActionValue[];
  action_values?: ActionValue[];
}

export interface AdMeta { status: string | null; thumbnail: string | null }

// Meta reports one event under several overlapping types, so take the first
// type present and never add them up.
function firstAction(list: ActionValue[] | undefined, types: string[]): number {
  for (const type of types) {
    const hit = list?.find((a) => a.action_type === type);
    if (hit) return Number(hit.value ?? 0);
  }
  return 0;
}

const PURCHASE = ["purchase", "offsite_conversion.fb_pixel_purchase"];
const ADD_TO_CART = ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT = ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const LEAD = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
const LANDING = ["landing_page_view"];

export function parseInsightRow(row: GraphInsightRow, accountId: string, meta?: AdMeta) {
  return {
    ad_account_id: accountId,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name ?? null,
    adset_id: row.adset_id ?? null,
    adset_name: row.adset_name ?? null,
    ad_id: row.ad_id,
    ad_name: row.ad_name ?? null,
    date: row.date_start,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: Number(row.frequency ?? 0),
    inline_link_clicks: Number(row.inline_link_clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    cpm: Number(row.cpm ?? 0),
    purchases: firstAction(row.actions, PURCHASE),
    purchase_value: firstAction(row.action_values, PURCHASE),
    add_to_cart: firstAction(row.actions, ADD_TO_CART),
    initiate_checkout: firstAction(row.actions, CHECKOUT),
    leads: firstAction(row.actions, LEAD),
    landing_page_views: firstAction(row.actions, LANDING),
    effective_status: meta?.status ?? null,
    thumbnail_url: meta?.thumbnail ?? null,
    updated_at: new Date().toISOString(),
  };
}

export interface InsightRow {
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  date: string;
  spend: number;
  impressions: number;
  inline_link_clicks: number;
  frequency: number;
  ctr: number;
  purchases: number;
  purchase_value: number;
  add_to_cart: number;
  initiate_checkout: number;
  leads: number;
  landing_page_views: number;
  effective_status: string | null;
  thumbnail_url: string | null;
}

export const cpa = (spend: number, purchases: number) => (purchases > 0 ? spend / purchases : null);
export const ratio = (value: number, spend: number) => (spend > 0 ? value / spend : null);

/** The account's average CPA over the rows given, the stand-in for a missing target. */
export function averageCpa(rows: InsightRow[]): number | null {
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  return cpa(spend, rows.reduce((n, r) => n + r.purchases, 0));
}

// Below this many impressions a day's CTR is mostly noise.
const FATIGUE_MIN_IMPRESSIONS = 1000;

export function isFatigued(today: InsightRow | undefined, yesterday: InsightRow | undefined): boolean {
  if (!today || !yesterday || today.impressions < FATIGUE_MIN_IMPRESSIONS) return false;
  return today.frequency > yesterday.frequency && today.ctr < yesterday.ctr;
}

export interface CreativeRow {
  ad_id: string;
  ad_account_id: string;
  name: string;
  campaign_name: string | null;
  thumbnail_url: string | null;
  spend: number;
  purchases: number;
  cpa: number | null;
  ctr: number;
  frequency: number;
  fatigued: boolean;
}

/**
 * Best and worst active ads by CPA over the rows given. An ad under its
 * account's minimum spend is left out; one over it with no purchase ranks worst.
 */
export function rankCreatives(
  rows: InsightRow[],
  today: string,
  yesterday: string,
  minSpend: (accountId: string) => number,
  size = 5,
  fatigueRows: InsightRow[] = rows
): { best: CreativeRow[]; worst: CreativeRow[] } {
  const byAd = new Map<string, InsightRow[]>();
  for (const r of rows) {
    const list = byAd.get(r.ad_id);
    if (list) list.push(r);
    else byAd.set(r.ad_id, [r]);
  }

  const creatives: CreativeRow[] = [];
  for (const [ad_id, list] of byAd) {
    const latest = list.reduce((a, b) => (b.date > a.date ? b : a));
    if (latest.effective_status !== "ACTIVE") continue;
    const spend = list.reduce((n, r) => n + r.spend, 0);
    if (spend < minSpend(latest.ad_account_id)) continue;

    const purchases = list.reduce((n, r) => n + r.purchases, 0);
    const impressions = list.reduce((n, r) => n + r.impressions, 0);
    creatives.push({
      ad_id,
      ad_account_id: latest.ad_account_id,
      name: latest.ad_name ?? ad_id,
      campaign_name: latest.campaign_name,
      thumbnail_url: latest.thumbnail_url,
      spend,
      purchases,
      cpa: cpa(spend, purchases),
      ctr: impressions > 0 ? list.reduce((n, r) => n + r.ctr * r.impressions, 0) / impressions : 0,
      frequency: latest.frequency,
      fatigued: isFatigued(
        fatigueRows.find((r) => r.ad_id === ad_id && r.date === today),
        fatigueRows.find((r) => r.ad_id === ad_id && r.date === yesterday)
      ),
    });
  }

  const best = creatives
    .filter((c) => c.cpa !== null)
    .sort((a, b) => a.cpa! - b.cpa! || b.spend - a.spend)
    .slice(0, size);
  const taken = new Set(best.map((c) => c.ad_id));
  const worst = creatives
    .filter((c) => !taken.has(c.ad_id))
    .sort((a, b) => (b.cpa ?? Infinity) - (a.cpa ?? Infinity) || b.spend - a.spend)
    .slice(0, size);
  return { best, worst };
}

export interface Alert { key: string; text: string }

const money = (v: number) => `${v.toFixed(2)} €`;

// Meta's account_status: 1 is active, anything else limits delivery.
const ACCOUNT_STATUS: Record<number, string> = {
  2: "onemogućen", 3: "neizmireno dugovanje", 7: "na proveri", 8: "čeka izmirenje", 9: "u grejs periodu", 100: "čeka zatvaranje", 101: "zatvoren",
};

/**
 * Today's alerts for one account. `recent` holds the 3 days before today,
 * used for the CPA comparison. The no-purchase limit is 2x target CPA (M4 P2).
 */
export function evaluateAlerts(input: {
  accountName: string;
  accountId: string;
  accountStatus: number | null;
  rows: InsightRow[];
  recent: InsightRow[];
  target: number | null;
}): Alert[] {
  const { accountName, accountId, accountStatus, rows, recent, target } = input;
  const alerts: Alert[] = [];

  if (accountStatus !== null && accountStatus !== 1)
    alerts.push({
      key: `account:${accountId}`,
      text: `⛔ Nalog ${accountName} je ograničen: ${ACCOUNT_STATUS[accountStatus] ?? `status ${accountStatus}`}`,
    });

  const campaigns = new Map<string, { name: string; spend: number; purchases: number }>();
  for (const r of rows) {
    const c = campaigns.get(r.campaign_id) ?? { name: r.campaign_name ?? r.campaign_id, spend: 0, purchases: 0 };
    c.spend += r.spend;
    c.purchases += r.purchases;
    campaigns.set(r.campaign_id, c);

    if (r.effective_status === "DISAPPROVED")
      alerts.push({ key: `ad:${r.ad_id}`, text: `🚫 Oglas odbijen: ${r.ad_name ?? r.ad_id} (${accountName})` });
  }

  for (const [id, c] of campaigns) {
    if (c.purchases === 0) {
      if (target && c.spend > 2 * target)
        alerts.push({ key: `no_purchase:${id}`, text: `🔴 ${c.name}: ${money(c.spend)} danas bez kupovine (${accountName})` });
      continue;
    }
    const past = recent.filter((r) => r.campaign_id === id);
    const avg = averageCpa(past);
    const today = c.spend / c.purchases;
    if (avg && today > 2 * avg)
      alerts.push({ key: `cpa:${id}`, text: `🟠 ${c.name}: CPA danas ${money(today)}, prosek 3 dana ${money(avg)} (${accountName})` });
  }
  return alerts;
}
