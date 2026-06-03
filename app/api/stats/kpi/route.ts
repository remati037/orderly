import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";

const EXCLUDED_STATUSES = ["cancelled", "refunded", "failed"];

function dayBounds(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const start = d.toISOString();
  d.setDate(d.getDate() + 1);
  return { start, end: d.toISOString() };
}

function monthBounds(offsetMonths = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1).toISOString();
  return { start, end };
}

function computeNetProfit(
  orders: Array<{
    total: number | null;
    currency: string | null;
    site_id: string | null;
    payment_method: string | null;
    order_items: Array<{ product_name: string | null; price: number | null; quantity: number | null }>;
  }>,
  siteMargins: Map<string, number>,
  productMap: Map<string, { cost_percent: number | null; cost_fixed: number | null }>,
  rates: Record<string, number>
): { revenue: number; netProfit: number; orders: number; stripeFees: number } {
  let revenue = 0;
  let netProfit = 0;
  let stripeFees = 0;

  for (const order of orders) {
    const total = order.total ?? 0;
    const currency = order.currency ?? "RSD";
    const siteId = order.site_id ?? "";
    const defaultMargin = siteMargins.get(siteId) ?? 50;
    const items = order.order_items ?? [];
    const isStripe = /stripe/i.test(order.payment_method ?? "");
    const revenueMultiplier = isStripe ? 0.95 : 1;

    revenue += toBase(total, currency, rates);

    if (isStripe) {
      stripeFees += toBase(total * 0.05, currency, rates);
    }

    let net = 0;
    if (items.length === 0) {
      net = total * revenueMultiplier * (defaultMargin / 100);
    } else {
      for (const item of items) {
        const price = item.price ?? 0;
        const qty = item.quantity ?? 1;
        const lineRevenue = price * qty * revenueMultiplier;
        const key = `${siteId}::${item.product_name}`;
        const override = productMap.get(key);

        if (override?.cost_percent != null) {
          net += lineRevenue * (1 - override.cost_percent / 100);
        } else if (override?.cost_fixed != null) {
          net += lineRevenue - override.cost_fixed * qty;
        } else {
          net += lineRevenue * (defaultMargin / 100);
        }
      }
    }

    netProfit += toBase(net, currency, rates);
  }

  return { revenue, netProfit, orders: orders.length, stripeFees };
}

async function queryOrders(
  supabase: ReturnType<typeof adminClient>,
  from: string,
  to: string,
  rates: Record<string, number>,
  siteMargins: Map<string, number>,
  productMap: Map<string, { cost_percent: number | null; cost_fixed: number | null }>,
  siteId?: string | null
) {
  let q = supabase
    .from("orders")
    .select("total, currency, site_id, payment_method, order_items(product_name, price, quantity)")
    .gte("created_at", from)
    .lt("created_at", to)
    .not("status", "in", `(${EXCLUDED_STATUSES.join(",")})`);

  if (siteId) q = q.eq("site_id", siteId);

  const { data, error } = await q;
  if (error || !data) return { revenue: 0, netProfit: 0, orders: 0 };

  return computeNetProfit(data as Parameters<typeof computeNetProfit>[0], siteMargins, productMap, rates);
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = new URL(request.url).searchParams.get("siteId");
  const supabase = adminClient();

  const [fx, sitesRes, productsRes] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("id, default_margin_percent"),
    supabase.from("products").select("site_id, name, cost_percent, cost_fixed"),
  ]);

  const siteMargins = new Map<string, number>(
    (sitesRes.data ?? []).map((s) => [s.id, s.default_margin_percent ?? 50])
  );
  const productMap = new Map<string, { cost_percent: number | null; cost_fixed: number | null }>(
    (productsRes.data ?? []).map((p) => [`${p.site_id}::${p.name}`, p])
  );

  const today     = dayBounds(0);
  const yesterday = dayBounds(-1);
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  const [todayData, yesterdayData, monthData, lastMonthData, activeSitesRes] =
    await Promise.all([
      queryOrders(supabase, today.start,     today.end,     fx.rates, siteMargins, productMap, siteId),
      queryOrders(supabase, yesterday.start, yesterday.end, fx.rates, siteMargins, productMap, siteId),
      queryOrders(supabase, thisMonth.start, thisMonth.end, fx.rates, siteMargins, productMap, siteId),
      queryOrders(supabase, lastMonth.start, lastMonth.end, fx.rates, siteMargins, productMap, siteId),
      supabase.from("sites").select("*", { count: "exact", head: true }).eq("is_active", true),
    ]);

  const aov_today =
    todayData.orders > 0 ? todayData.revenue / todayData.orders : 0;

  return NextResponse.json({
    base_currency:        fx.baseCurrency,
    revenue_today:        todayData.revenue,
    revenue_yesterday:    yesterdayData.revenue,
    revenue_month:        monthData.revenue,
    revenue_last_month:   lastMonthData.revenue,
    orders_today:         todayData.orders,
    orders_yesterday:     yesterdayData.orders,
    aov_today,
    net_profit_today:     todayData.netProfit,
    stripe_fees_today:    todayData.stripeFees,
    active_sites:         activeSitesRes.count ?? 0,
  });
}
