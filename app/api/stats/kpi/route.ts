import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";

const EXCLUDED_STATUSES = ["cancelled", "refunded"];

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

async function queryOrders(
  supabase: ReturnType<typeof adminClient>,
  from: string,
  to: string,
  rates: Record<string, number>,
  siteId?: string | null
) {
  let q = supabase
    .from("orders")
    .select("total, net_profit, currency")
    .gte("created_at", from)
    .lt("created_at", to)
    .not("status", "in", `(${EXCLUDED_STATUSES.join(",")})`);

  if (siteId) q = q.eq("site_id", siteId);

  const { data, error } = await q;
  if (error || !data) return { revenue: 0, netProfit: 0, orders: 0 };

  return {
    revenue:   data.reduce((s, r) => s + toBase(r.total     ?? 0, r.currency ?? "RSD", rates), 0),
    netProfit: data.reduce((s, r) => s + toBase(r.net_profit ?? 0, r.currency ?? "RSD", rates), 0),
    orders: data.length,
  };
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = new URL(request.url).searchParams.get("siteId");
  const supabase = adminClient();

  const fx = await loadFxSettings(supabase);

  const today     = dayBounds(0);
  const yesterday = dayBounds(-1);
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  const [todayData, yesterdayData, monthData, lastMonthData, activeSitesRes] =
    await Promise.all([
      queryOrders(supabase, today.start,     today.end,     fx.rates, siteId),
      queryOrders(supabase, yesterday.start, yesterday.end, fx.rates, siteId),
      queryOrders(supabase, thisMonth.start, thisMonth.end, fx.rates, siteId),
      queryOrders(supabase, lastMonth.start, lastMonth.end, fx.rates, siteId),
      supabase.from("sites").select("*", { count: "exact", head: true }).eq("is_active", true),
    ]);

  const aov_today =
    todayData.orders > 0 ? todayData.revenue / todayData.orders : 0;

  return NextResponse.json({
    base_currency:       fx.baseCurrency,
    revenue_today:       todayData.revenue,
    revenue_yesterday:   yesterdayData.revenue,
    revenue_month:       monthData.revenue,
    revenue_last_month:  lastMonthData.revenue,
    orders_today:        todayData.orders,
    orders_yesterday:    yesterdayData.orders,
    aov_today,
    net_profit_today:    todayData.netProfit,
    active_sites:        activeSitesRes.count ?? 0,
  });
}
