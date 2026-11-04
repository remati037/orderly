import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchPaidOrders, fetchRefunds, type RevenueOrder, type RevenueRefund } from "@/lib/metrics";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { belgradeDate, customBounds, dayBounds } from "@/lib/utils/tz";
import { averageCpa, ratio, type InsightRow } from "./insights";
import { buildAccountReport, isSpending, metricsOf, periodRange, type PeriodKey } from "./report";

const INSIGHT_COLUMNS =
  "ad_account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, date, spend, impressions, inline_link_clicks, frequency, ctr, purchases, purchase_value, add_to_cart, initiate_checkout, leads, landing_page_views, effective_status, thumbnail_url";

export interface LiveAccount {
  id: string;
  name: string;
  currency: string;
  fb_account_id: string;
  meta_account_status: number | null;
  live_synced_at: string | null;
  live_sync_error: string | null;
  site_id: string | null;
}

/** Active accounts, with rows of the last `days` days in base currency. */
export async function loadLiveInsights(supabase: SupabaseClient, days: number) {
  const fx = await loadFxSettings(supabase);
  const [accountsRes, cfgRes, rowsRes] = await Promise.all([
    supabase
      .from("ad_accounts")
      .select("id, name, currency, fb_account_id, meta_account_status, live_synced_at, live_sync_error, site_id")
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
        inline_link_clicks: Number(r.inline_link_clicks),
        add_to_cart: Number(r.add_to_cart),
        initiate_checkout: Number(r.initiate_checkout),
        leads: Number(r.leads),
        landing_page_views: Number(r.landing_page_views),
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

/** Everything /reklame shows for one period. */
export async function loadLivePage(supabase: SupabaseClient, period: PeriodKey) {
  const { fx, accounts, rows, targets } = await loadLiveInsights(supabase, 31);
  const today = belgradeDate();
  const range = periodRange(period, today);

  const [mapRes, sitesRes, recsRes] = await Promise.all([
    supabase.from("ad_campaign_map").select("campaign_id, site_id"),
    supabase.from("sites").select("id, name"),
    supabase
      .from("ad_recommendations")
      .select("id, created_at, ad_account_id, level, entity_name, type, priority, text")
      .eq("status", "open")
      .order("priority")
      .order("created_at", { ascending: false }),
  ]);

  // Net revenue reaches back far enough for the chosen period and the account cards.
  const yesterday = belgradeDate(dayBounds(-1).start);
  const weekFrom = belgradeDate(dayBounds(-7).start);
  const earliest = range.from < weekFrom ? range.from : weekFrom;
  const { start, end } = customBounds(earliest, today);
  const net = await netBySiteDay(supabase, start, end, fx.rates);

  const netOf = (from: string, to: string, siteId?: string) => {
    let sum = 0;
    for (const [day, sites] of net) {
      if (day < from || day > to) continue;
      for (const [id, amount] of sites) if (!siteId || id === siteId) sum += amount;
    }
    return sum;
  };
  const netTotal = netOf(range.from, range.to);

  const siteName = new Map((sitesRes.data ?? []).map((s) => [s.id, s.name as string]));
  const siteOf = new Map((mapRes.data ?? []).map((m) => [m.campaign_id, m.site_id as string | null]));

  const inRange = rows.filter((r) => r.date >= range.from && r.date <= range.to);

  // Rough ROAS from real sales: all of a site's net revenue over the spend of the
  // campaigns linked to it. It includes sales that didn't come from ads.
  const orderlyRoas = (siteId: string | null, from: string, to: string) => {
    if (!siteId) return null;
    const spend = rows
      .filter((r) => r.date >= from && r.date <= to && siteOf.get(r.campaign_id) === siteId)
      .reduce((n, r) => n + r.spend, 0);
    return ratio(netOf(from, to, siteId), spend);
  };

  const liveAccounts = accounts
    .filter((a) => isSpending(rows.filter((r) => r.ad_account_id === a.id), today))
    .map((a) => {
      // Rows are in base currency; each account shows in its own.
      const rate = toBase(1, a.currency, fx.rates);
      const own = rows
        .filter((r) => r.ad_account_id === a.id)
        .map((r) => ({ ...r, spend: r.spend / rate, purchase_value: r.purchase_value / rate }));
      const target = accountTarget(own, a.id, targets[a.id] ? { [a.id]: targets[a.id] / rate } : {});
      const report = buildAccountReport(
        own,
        range,
        target.value,
        today,
        (campaignId) => {
          const site = siteOf.get(campaignId) ?? null;
          return {
            site_name: site ? siteName.get(site) ?? null : null,
            real_roas_site: orderlyRoas(site, range.from, range.to),
          };
        },
        a.currency
      );
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        fb_account_id: a.fb_account_id,
        status: a.meta_account_status,
        synced_at: a.live_synced_at,
        error: a.live_sync_error,
        target_cpa: target.value,
        target_estimated: target.estimated,
        orderly_roas: {
          site_name: a.site_id ? siteName.get(a.site_id) ?? null : null,
          yesterday: orderlyRoas(a.site_id, yesterday, yesterday),
          week: orderlyRoas(a.site_id, weekFrom, yesterday),
          period: orderlyRoas(a.site_id, range.from, range.to),
        },
        ...report,
      };
    })
    .sort((a, b) => b.card.week.spend * toBase(1, b.currency, fx.rates) - a.card.week.spend * toBase(1, a.currency, fx.rates));

  const totals = metricsOf(inRange);
  const prevRows = range.prevFrom ? rows.filter((r) => r.date >= range.prevFrom! && r.date <= range.prevTo!) : null;
  const syncTimes = accounts.map((a) => a.live_synced_at).filter((t): t is string => !!t).sort();
  return {
    base_currency: fx.baseCurrency,
    period,
    range,
    synced_at: syncTimes[0] ?? null,
    totals,
    previous: prevRows ? metricsOf(prevRows) : null,
    net: netTotal,
    real_roas: ratio(netTotal, totals.spend),
    accounts: liveAccounts,
    unmapped_spending: liveAccounts.flatMap((a) => a.campaigns).filter((c) => !c.site_name).length,
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
    const leads = list.reduce((n, r) => n + r.leads, 0);
    return { spend, purchases, purchase_value: value, leads, cpa: purchases ? spend / purchases : null, roas: ratio(value, spend) };
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
        // Only what spent lately: old boosted posts would bloat every scheduled run.
        campaigns: groupBy(own.filter((r) => r.date >= weekAgo && r.spend > 0), (r) => r.campaign_id).map((recent) => own.filter((r) => r.campaign_id === recent[0].campaign_id)).map((c) => ({
          id: c[0].campaign_id,
          name: latest(c).campaign_name,
          active: c.some((r) => r.date >= yesterday && r.effective_status === "ACTIVE"),
          ...periods(c),
          ads: groupBy(c.filter((r) => r.date >= weekAgo && r.spend > 0), (r) => r.ad_id).map((recent) => c.filter((r) => r.ad_id === recent[0].ad_id)).map((ad) => {
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
