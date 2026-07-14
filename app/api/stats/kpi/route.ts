import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { dayBounds, todayComparisonBounds, weekBounds, monthBounds, yearBounds, customBounds } from "@/lib/utils/tz";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

interface PeriodResult {
  revenue: number;
  netProfit: number;
  orders: number;
  stripeFees: number;
}

type OrderRow = {
  total: number | null;
  net_profit: number | null;
  currency: string | null;
  payment_method: string | null;
  processor_fee: number | null;
};

function sumOrders(rows: OrderRow[], rates: Record<string, number>): PeriodResult {
  let revenue = 0, netProfit = 0, stripeFees = 0;
  for (const o of rows) {
    const total    = o.total ?? 0;
    const currency = o.currency ?? "RSD";
    const isStripe = /stripe/i.test(o.payment_method ?? "");
    revenue   += toBase(total, currency, rates);
    netProfit += toBase(o.net_profit ?? 0, currency, rates);
    // Use the real Stripe fee when we captured it; otherwise fall back to 5%.
    if (o.processor_fee != null) stripeFees += toBase(o.processor_fee, currency, rates);
    else if (isStripe)          stripeFees += toBase(total * 0.05, currency, rates);
  }
  return { revenue, netProfit, orders: rows.length, stripeFees };
}

const EMPTY: PeriodResult = { revenue: 0, netProfit: 0, orders: 0, stripeFees: 0 };

async function queryOrders(
  supabase: ReturnType<typeof adminClient>,
  from: string,
  to: string,
  rates: Record<string, number>,
  siteId?: string | null,
  products?: string[] | null,
): Promise<PeriodResult> {
  if (products?.length) {
    // Supabase TS cannot infer types for non-literal select strings; cast to any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("orders")
      .select("total, net_profit, currency, payment_method, processor_fee, order_items!inner(product_name)")
      .gte("created_at", from)
      .lt("created_at", to)
      .in("status", COUNTED_STATUSES)
      .in("order_items.product_name", products);
    if (siteId) q = q.eq("site_id", siteId);
    const { data, error } = (await q) as { data: OrderRow[] | null; error: unknown };
    return error || !data ? EMPTY : sumOrders(data, rates);
  }

  let q = supabase
    .from("orders")
    .select("total, net_profit, currency, payment_method, processor_fee")
    .gte("created_at", from)
    .lt("created_at", to)
    .in("status", COUNTED_STATUSES);
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  return error || !data ? EMPTY : sumOrders(data as OrderRow[], rates);
}

interface Bounds { start: string; end: string }

// Shift a window back one day or one month (used only for the "today" view,
// where the comparison basis is user-selectable).
function shiftBack(b: Bounds, compare: string): Bounds {
  const shift = (iso: string): string => {
    const d = new Date(iso);
    if (compare === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 1); // default: previous day
    return d.toISOString();
  };
  return { start: shift(b.start), end: shift(b.end) };
}

// Current window + its natural comparison window for each preset.
// "today" uses the day/month compare toggle; every other preset compares to
// its own previous period (month→prev month, week→prev week, …).
function periodBounds(
  preset: string,
  from: string | null,
  to: string | null,
  compare: string
): { current: Bounds; prev: Bounds } {
  switch (preset) {
    case "yesterday":
      return { current: dayBounds(-1), prev: dayBounds(-2) };
    case "this_week":
      return { current: weekBounds(0), prev: weekBounds(-1) };
    case "this_month":
      return { current: monthBounds(0), prev: monthBounds(-1) };
    case "this_year":
      return { current: yearBounds(0), prev: yearBounds(-1) };
    case "custom":
      if (from && to) {
        const b = customBounds(from, to);
        return {
          current: { start: b.start,     end: b.end     },
          prev:    { start: b.prevStart, end: b.prevEnd },
        };
      }
      return { current: dayBounds(0), prev: dayBounds(-1) };
    default: { // "today" — partial day, comparison basis is selectable
      const current = todayComparisonBounds().current;
      return { current, prev: shiftBack(current, compare) };
    }
  }
}

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp            = new URL(request.url).searchParams;
  const preset        = sp.get("preset") ?? "today";
  const compare       = sp.get("compare") === "month" ? "month" : "day";
  const from          = sp.get("from");
  const to            = sp.get("to");
  const siteId        = sp.get("siteId");
  const productsParam = sp.get("products");
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : null;

  const supabase = adminClient();

  const [fx, activeSitesRes] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const { current, prev } = periodBounds(preset, from, to, compare);

  const [currentData, prevData] = await Promise.all([
    queryOrders(supabase, current.start, current.end, fx.rates, siteId, products),
    queryOrders(supabase, prev.start,    prev.end,    fx.rates, siteId, products),
  ]);

  const aov     = currentData.orders > 0 ? currentData.revenue / currentData.orders : 0;
  const aovPrev = prevData.orders    > 0 ? prevData.revenue    / prevData.orders    : 0;

  return NextResponse.json({
    base_currency:   fx.baseCurrency,
    revenue_current: currentData.revenue,
    revenue_prev:    prevData.revenue,
    orders_current:  currentData.orders,
    orders_prev:     prevData.orders,
    aov_current:     aov,
    aov_prev:        aovPrev,
    net_profit:      currentData.netProfit,
    stripe_fees:     currentData.stripeFees,
    active_sites:    activeSitesRes.count ?? 0,
  });
}
