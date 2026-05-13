import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

function startOfDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d.toISOString();
}

async function sumOrders(
  supabase: ReturnType<typeof adminClient>,
  from: string,
  to: string
) {
  const { data, error } = await supabase
    .from("orders")
    .select("total, net_profit")
    .gte("created_at", from)
    .lt("created_at", to)
    .in("status", ["completed", "processing"]);

  if (error || !data) return { revenue: 0, netProfit: 0, orders: 0 };

  return {
    revenue: data.reduce((s, r) => s + (r.total ?? 0), 0),
    netProfit: data.reduce((s, r) => s + (r.net_profit ?? 0), 0),
    orders: data.length,
  };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const now = new Date();

  const todayStart = startOfDay(now);
  const tomorrowStart = startOfDay(new Date(now.getTime() + 86_400_000));
  const yesterdayStart = startOfDay(new Date(now.getTime() - 86_400_000));

  const thisMonthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );

  const [today, yesterday, thisMonth, lastMonth] = await Promise.all([
    sumOrders(supabase, todayStart, tomorrowStart),
    sumOrders(supabase, yesterdayStart, todayStart),
    sumOrders(supabase, thisMonthStart, tomorrowStart),
    sumOrders(supabase, prevMonthStart, thisMonthStart),
  ]);

  const aovToday = today.orders > 0 ? today.revenue / today.orders : 0;
  const aovYesterday =
    yesterday.orders > 0 ? yesterday.revenue / yesterday.orders : 0;

  return NextResponse.json({
    revenueToday: today.revenue,
    revenueTodayTrend: pctChange(today.revenue, yesterday.revenue),
    revenueMonth: thisMonth.revenue,
    revenueMonthTrend: pctChange(thisMonth.revenue, lastMonth.revenue),
    ordersToday: today.orders,
    ordersTodayTrend: pctChange(today.orders, yesterday.orders),
    aovToday,
    aovTodayTrend: pctChange(aovToday, aovYesterday),
    netProfitToday: today.netProfit,
    netProfitTodayTrend: pctChange(today.netProfit, yesterday.netProfit),
  });
}
