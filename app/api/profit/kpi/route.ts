import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { start, end } = monthBounds();

  const [ordersRes, productsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("total, net_profit")
      .gte("created_at", start)
      .lt("created_at", end)
      .not("status", "in", "(cancelled,refunded)"),
    supabase
      .from("products")
      .select("name, cost_percent")
      .not("cost_percent", "is", null),
  ]);

  const orders = ordersRes.data ?? [];
  const grossRevenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
  const netProfit = orders.reduce((s, o) => s + (o.net_profit ?? 0), 0);
  const avgMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  let highestMarginProduct: string | null = null;
  const products = productsRes.data ?? [];
  if (products.length > 0) {
    const sorted = [...products].sort(
      (a, b) => (a.cost_percent ?? 100) - (b.cost_percent ?? 100)
    );
    highestMarginProduct = sorted[0]?.name ?? null;
  }

  return NextResponse.json({
    gross_revenue_month: grossRevenue,
    net_profit_month: netProfit,
    avg_margin_pct: Math.round(avgMargin * 10) / 10,
    highest_margin_product: highestMarginProduct,
  });
}
