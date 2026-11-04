import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchPaidOrders, fetchRefunds, type RevenueOrder, type RevenueRefund } from "@/lib/metrics";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { belgradeDate, customBounds, dayBounds } from "@/lib/utils/tz";
import { siteShare, sortedTiers, type BonusProgram } from "@/lib/bonus/program";
import {
  averageCpa, buildCampaigns, ratio, rankCreatives, type CampaignRow, type InsightRow,
} from "./insights";

const INSIGHT_COLUMNS =
  "ad_account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date, spend, impressions, frequency, ctr, purchases, purchase_value, effective_status, thumbnail_url";

// Spend an ad needs for the creative ranking when an account has no target CPA at all.
const FALLBACK_MIN_SPEND = 10;

export interface LiveAccount {
  id: string;
  name: string;
  currency: string;
  fb_account_id: string;
  meta_account_status: number | null;
  live_synced_at: string | null;
  live_sync_error: string | null;
}

/** Active accounts, with rows of the last `days` days in base currency. */
export async function loadLiveInsights(supabase: SupabaseClient, days: number) {
  const fx = await loadFxSettings(supabase);
  const [accountsRes, cfgRes, rowsRes] = await Promise.all([
    supabase
      .from("ad_accounts")
      .select("id, name, currency, fb_account_id, meta_account_status, live_synced_at, live_sync_error")
      .eq("is_active", true)
      .order("name"),
    supabase.from("settings").select("value").eq("key", "meta_live").maybeSingle(),
    fetchAll<InsightRow>(() =>
      supabase
        .from("ad_insights_daily")
        .select(INSIGHT_COLUMNS)
        .gte("date", belgradeDate(dayBounds(-(days - 1)).start))
        .order("id") as never
    ),
  ]);
  if (accountsRes.error || rowsRes.error) throw new Error("Failed to load ad insights");

  const accounts = (accountsRes.data ?? []) as LiveAccount[];
  const currency = new Map(accounts.map((a) => [a.id, a.currency]));
  const rows = rowsRes.data
    .filter((r) => currency.has(r.ad_account_id))
    .map((r) => {
      const cur = currency.get(r.ad_account_id)!;
      return {
        ...r,
        spend: toBase(Number(r.spend), cur, fx.rates),
        purchase_value: toBase(Number(r.purchase_value), cur, fx.rates),
        impressions: Number(r.impressions),
        frequency: Number(r.frequency),
        ctr: Number(r.ctr),
        purchases: Number(r.purchases),
      };
    });

  return { fx, accounts, rows, targets: (cfgRes.data?.value as { target_cpa?: Record<string, number> } | null)?.target_cpa ?? {} };
}

/** Target CPA set for the account, else its average over the rows (an estimate). */
export function accountTarget(rows: InsightRow[], accountId: string, targets: Record<string, number>) {
  const set = targets[accountId];
  if (set) return { value: set, estimated: false };
  return { value: averageCpa(rows.filter((r) => r.ad_account_id === accountId)), estimated: true };
}

type NetOrder = RevenueOrder & { site_id: string; created_at: string };
type NetRefund = RevenueRefund & { site_id: string; refunded_at: string };

// Net revenue (paid orders − refunds) per Belgrade day per site, the same way /bonus counts it.
async function netBySiteDay(supabase: SupabaseClient, start: string, end: string, rates: Record<string, number>) {
  const [orders, refunds] = await Promise.all([
    fetchPaidOrders<NetOrder>(supabase, { start, end }, "site_id, created_at"),
    fetchRefunds<NetRefund>(supabase, { start, end }, "site_id, refunded_at"),
  ]);
  if (orders.error || refunds.error) throw new Error("Failed to load orders");

  const net = new Map<string, Map<string, number>>();
  const add = (day: string, siteId: string, amount: number) => {
    let sites = net.get(day);
    if (!sites) net.set(day, (sites = new Map()));
    sites.set(siteId, (sites.get(siteId) ?? 0) + amount);
  };
  for (const o of orders.data) add(belgradeDate(o.created_at), o.site_id, toBase(Number(o.total ?? 0), o.currency ?? "RSD", rates));
  for (const r of refunds.data) add(belgradeDate(r.refunded_at), r.site_id, -toBase(Number(r.amount), r.currency, rates));
  return net;
}

const total = (sites: Map<string, number> | undefined) => [...(sites?.values() ?? [])].reduce((n, v) => n + v, 0);

export interface LiveCampaign extends CampaignRow {
  site_name: string | null;
  real_roas_site: number | null;
}

/** Everything /reklame shows. */
export async function loadLivePage(supabase: SupabaseClient) {
  const { fx, accounts, rows, targets } = await loadLiveInsights(supabase, 30);
  const today = belgradeDate();
  const yesterday = belgradeDate(dayBounds(-1).start);
  const weekAgo = belgradeDate(dayBounds(-6).start);

  const [mapRes, sitesRes, cfgRes, recsRes] = await Promise.all([
    supabase.from("ad_campaign_map").select("campaign_id, site_id"),
    supabase.from("sites").select("id, name"),
    supabase.from("settings").select("value").eq("key", "bonus_program").maybeSingle(),
    supabase
      .from("ad_recommendations")
      .select("id, created_at, ad_account_id, level, entity_name, type, priority, text")
      .eq("status", "open")
      .order("priority")
      .order("created_at", { ascending: false }),
  ]);

  const net = await netBySiteDay(supabase, dayBounds(-1).start, dayBounds(0).end, fx.rates);
  const siteName = new Map((sitesRes.data ?? []).map((s) => [s.id, s.name as string]));
  const siteOf = new Map((mapRes.data ?? []).map((m) => [m.campaign_id, m.site_id as string | null]));

  const spendBySite = new Map<string, number>();
  for (const r of rows) {
    const site = siteOf.get(r.campaign_id);
    if (r.date === today && site) spendBySite.set(site, (spendBySite.get(site) ?? 0) + r.spend);
  }

  const dayTotals = (day: string) => {
    const dayRows = rows.filter((r) => r.date === day);
    const spend = dayRows.reduce((n, r) => n + r.spend, 0);
    const netRevenue = total(net.get(day));
    return {
      spend,
      meta_revenue: dayRows.reduce((n, r) => n + r.purchase_value, 0),
      purchases: dayRows.reduce((n, r) => n + r.purchases, 0),
      net: netRevenue,
      real_roas: ratio(netRevenue, spend),
    };
  };

  const liveAccounts = accounts.map((a) => {
    const target = accountTarget(rows, a.id, targets);
    const campaigns: LiveCampaign[] = buildCampaigns(rows.filter((r) => r.ad_account_id === a.id), today, yesterday, target.value)
      .map((c) => {
        const site = siteOf.get(c.campaign_id) ?? null;
        return {
          ...c,
          site_name: site ? siteName.get(site) ?? null : null,
          real_roas_site: site ? ratio(net.get(today)?.get(site) ?? 0, spendBySite.get(site) ?? 0) : null,
        };
      });
    return {
      id: a.id,
      name: a.name,
      currency: a.currency,
      status: a.meta_account_status,
      synced_at: a.live_synced_at,
      error: a.live_sync_error,
      target_cpa: target.value,
      target_estimated: target.estimated,
      campaigns,
    };
  });

  const targetOf = new Map(liveAccounts.map((a) => [a.id, a.target_cpa]));
  const creatives = rankCreatives(
    rows.filter((r) => r.date >= weekAgo),
    today,
    yesterday,
    (id) => targetOf.get(id) ?? FALLBACK_MIN_SPEND
  );

  const program = cfgRes.data?.value as BonusProgram | undefined;
  let blackFriday = null;
  if (program) {
    const { start, end } = customBounds(program.from, program.to);
    const bf = await netBySiteDay(supabase, start, end, fx.rates);
    let counted = 0;
    for (const sites of bf.values())
      for (const [siteId, amount] of sites) counted += amount * siteShare(program, siteId);
    const tiers = sortedTiers(program);
    blackFriday = { name: program.name, from: program.from, to: program.to, counted, goal: tiers[tiers.length - 1]?.from ?? 0 };
  }

  const syncTimes = accounts.map((a) => a.live_synced_at).filter((t): t is string => !!t).sort();
  return {
    base_currency: fx.baseCurrency,
    synced_at: syncTimes[0] ?? null,
    black_friday: blackFriday,
    today: dayTotals(today),
    yesterday: dayTotals(yesterday),
    accounts: liveAccounts,
    creatives,
    unmapped_active: liveAccounts.flatMap((a) => a.campaigns).filter((c) => c.active && !c.site_name && (c.spend_today > 0 || c.spend_yesterday > 0)).length,
    recommendations: (recsRes.data ?? []).map((r) => ({
      ...r,
      account_name: accounts.find((a) => a.id === r.ad_account_id)?.name ?? null,
    })),
  };
}

const LARGEST_ORDERS = 10;

/** Summary for Claude's recommendation run: today, yesterday and 7 days per account, campaign and ad. */
export async function loadLiveSummary(supabase: SupabaseClient) {
  const { fx, accounts, rows, targets } = await loadLiveInsights(supabase, 30);
  const today = belgradeDate();
  const yesterday = belgradeDate(dayBounds(-1).start);
  const weekAgo = belgradeDate(dayBounds(-6).start);

  const { start, end } = { start: dayBounds(-6).start, end: dayBounds(0).end };
  const orders = await fetchPaidOrders<NetOrder & { woo_order_id: string | number | null }>(supabase, { start, end }, "site_id, created_at, woo_order_id");
  if (orders.error) throw new Error("Failed to load orders");

  const stats = (list: InsightRow[]) => {
    const spend = list.reduce((n, r) => n + r.spend, 0);
    const purchases = list.reduce((n, r) => n + r.purchases, 0);
    const value = list.reduce((n, r) => n + r.purchase_value, 0);
    return { spend, purchases, purchase_value: value, cpa: purchases ? spend / purchases : null, roas: ratio(value, spend) };
  };
  const periods = (list: InsightRow[]) => ({
    today: stats(list.filter((r) => r.date === today)),
    yesterday: stats(list.filter((r) => r.date === yesterday)),
    last_7_days: stats(list.filter((r) => r.date >= weekAgo)),
    last_30_days: stats(list),
    first_seen: list.reduce((d, r) => (r.date < d ? r.date : d), today),
  });
  const groupBy = (list: InsightRow[], key: (r: InsightRow) => string) => {
    const groups = new Map<string, InsightRow[]>();
    for (const r of list) {
      const k = key(r);
      const g = groups.get(k);
      if (g) g.push(r);
      else groups.set(k, [r]);
    }
    return [...groups.values()];
  };
  const latest = (list: InsightRow[]) => list.reduce((a, b) => (b.date > a.date ? b : a));

  return {
    base_currency: fx.baseCurrency,
    today,
    accounts: accounts.map((a) => {
      const own = rows.filter((r) => r.ad_account_id === a.id);
      const target = accountTarget(rows, a.id, targets);
      return {
        id: a.id,
        name: a.name,
        fb_account_id: a.fb_account_id,
        status: a.meta_account_status,
        synced_at: a.live_synced_at,
        sync_error: a.live_sync_error,
        target_cpa: target.value,
        target_estimated: target.estimated,
        ...periods(own),
        campaigns: groupBy(own, (r) => r.campaign_id).map((c) => ({
          id: c[0].campaign_id,
          name: latest(c).campaign_name,
          active: c.some((r) => r.date >= yesterday && r.effective_status === "ACTIVE"),
          ...periods(c),
          ads: groupBy(c, (r) => r.ad_id).map((ad) => {
            const last = latest(ad);
            return {
              id: last.ad_id,
              name: last.ad_name,
              adset_id: last.adset_id,
              adset_name: last.adset_name,
              status: last.effective_status,
              frequency: last.frequency,
              ctr: last.ctr,
              ...periods(ad),
            };
          }),
        })),
      };
    }),
    // Biggest single orders of the week, to spot one purchase inflating a ROAS.
    largest_orders: orders.data
      .map((o) => ({
        woo_order_id: o.woo_order_id,
        site_id: o.site_id,
        created_at: o.created_at,
        total: toBase(Number(o.total ?? 0), o.currency ?? "RSD", fx.rates),
      }))
      .sort((x, y) => y.total - x.total)
      .slice(0, LARGEST_ORDERS),
  };
}
