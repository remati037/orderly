import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { periodBounds } from "@/lib/utils/kpi-period";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { fetchAll } from "@/lib/supabase/fetch-all";

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
    const { data, error } = await fetchAll<OrderRow>(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("orders")
        .select("total, net_profit, currency, payment_method, processor_fee, order_items!inner(product_name)")
        .gte("created_at", from)
        .lt("created_at", to)
        .in("status", COUNTED_STATUSES)
        .in("order_items.product_name", products)
        .order("id");
      if (siteId) q = q.eq("site_id", siteId);
      return q;
    });
    return error ? EMPTY : sumOrders(data, rates);
  }

  const { data, error } = await fetchAll<OrderRow>(() => {
    let q = supabase
      .from("orders")
      .select("total, net_profit, currency, payment_method, processor_fee")
      .gte("created_at", from)
      .lt("created_at", to)
      .in("status", COUNTED_STATUSES)
      .order("id");
    if (siteId) q = q.eq("site_id", siteId);
    return q;
  });
  return error ? EMPTY : sumOrders(data, rates);
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

  const { current, prev, prevSamePeriod } = periodBounds(preset, from, to, compare);

  const [currentData, prevData, prevSamePeriodData] = await Promise.all([
    queryOrders(supabase, current.start, current.end, fx.rates, siteId, products),
    queryOrders(supabase, prev.start,    prev.end,    fx.rates, siteId, products),
    prevSamePeriod
      ? queryOrders(supabase, prevSamePeriod.start, prevSamePeriod.end, fx.rates, siteId, products)
      : null,
  ]);

  const aov     = currentData.orders > 0 ? currentData.revenue / currentData.orders : 0;
  const aovPrev = prevData.orders    > 0 ? prevData.revenue    / prevData.orders    : 0;

  return NextResponse.json({
    base_currency:   fx.baseCurrency,
    revenue_current: currentData.revenue,
    revenue_prev:    prevData.revenue,
    // Only set for presets where "current" is a partial period (currently
    // this_month) — the fair basis for a trend %, vs. revenue_prev which is
    // the full previous period (e.g. the whole previous month).
    revenue_prev_same_period: prevSamePeriodData?.revenue ?? null,
    orders_current:  currentData.orders,
    orders_prev:     prevData.orders,
    aov_current:     aov,
    aov_prev:        aovPrev,
    net_profit:      currentData.netProfit,
    stripe_fees:     currentData.stripeFees,
    active_sites:    activeSitesRes.count ?? 0,
  });
}
