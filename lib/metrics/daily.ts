import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { toBase } from "@/lib/utils/fx";

// daily_stats (migration 027): one row per site / local day / currency, amounts
// in that currency. For whole-day reports; partial days ("today so far vs the
// same time yesterday") go through revenue.ts on raw rows instead.

export interface DailyStatsRow {
  site_id: string;
  day: string; // YYYY-MM-DD, organization's local day
  currency: string;
  orders: number;
  gross: number;
  refunds: number;
  refund_count: number;
  net: number;
  net_profit: number;
  fees: number;
}

export interface DayTotals {
  day: string;
  orders: number;
  gross: number;
  refunds: number;
  refundCount: number;
  net: number;
  netProfit: number;
  fees: number;
}

const COLUMNS = "site_id, day, currency, orders, gross, refunds, refund_count, net, net_profit, fees";

export function fetchDailyStats(
  supabase: SupabaseClient,
  q: { fromDay: string; toDay: string; siteId?: string | null; orgId?: string | null }
) {
  return fetchAll<DailyStatsRow>(() => {
    let b = supabase
      .from("daily_stats")
      .select(COLUMNS)
      .gte("day", q.fromDay)
      .lte("day", q.toDay)
      .order("day")
      .order("site_id")
      .order("currency");
    if (q.siteId) b = b.eq("site_id", q.siteId);
    if (q.orgId) b = b.eq("org_id", q.orgId);
    return b;
  });
}

const zero = (day: string): DayTotals =>
  ({ day, orders: 0, gross: 0, refunds: 0, refundCount: 0, net: 0, netProfit: 0, fees: 0 });

/** Rows → one total per day (all sites and currencies, in the base currency). */
export function totalsByDay(rows: DailyStatsRow[], rates: Record<string, number>): DayTotals[] {
  const byDay = new Map<string, DayTotals>();
  for (const r of rows) {
    const t = byDay.get(r.day) ?? zero(r.day);
    t.orders += Number(r.orders);
    t.refundCount += Number(r.refund_count);
    t.gross += toBase(Number(r.gross), r.currency, rates);
    t.refunds += toBase(Number(r.refunds), r.currency, rates);
    t.net += toBase(Number(r.net), r.currency, rates);
    t.netProfit += toBase(Number(r.net_profit), r.currency, rates);
    t.fees += toBase(Number(r.fees), r.currency, rates);
    byDay.set(r.day, t);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Sum of several days. */
export function sumDays(days: DayTotals[]): Omit<DayTotals, "day"> & { aov: number } {
  const s = days.reduce(
    (a, d) => ({
      orders: a.orders + d.orders, gross: a.gross + d.gross, refunds: a.refunds + d.refunds,
      refundCount: a.refundCount + d.refundCount, net: a.net + d.net,
      netProfit: a.netProfit + d.netProfit, fees: a.fees + d.fees,
    }),
    { orders: 0, gross: 0, refunds: 0, refundCount: 0, net: 0, netProfit: 0, fees: 0 }
  );
  return { ...s, aov: s.orders ? s.net / s.orders : 0 };
}
