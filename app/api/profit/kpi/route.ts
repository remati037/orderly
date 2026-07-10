import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { getMappedSpend } from "@/lib/utils/ad-spend";
import { monthBounds } from "@/lib/utils/tz";

export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();
  const [fx, { start, end }] = await Promise.all([
    loadFxSettings(supabase),
    Promise.resolve(monthBounds()),
  ]);

  const [ordersRes, productsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("total, net_profit, currency")
      .gte("created_at", start)
      .lt("created_at", end)
      .in("status", COUNTED_STATUSES),
    supabase
      .from("products")
      .select("name, cost_percent")
      .not("cost_percent", "is", null),
  ]);

  const orders = ordersRes.data ?? [];
  const grossRevenue = orders.reduce((s, o) => s + toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates), 0);
  const netProfit = orders.reduce((s, o) => s + toBase(o.net_profit ?? 0, o.currency ?? "RSD", fx.rates), 0);

  // Subtract mapped Facebook ad spend for the same month.
  const adSpend = await getMappedSpend(supabase, start.split("T")[0], end.split("T")[0], fx.rates);
  const netProfitAfterAds = netProfit - adSpend.total;
  const avgMargin = grossRevenue > 0 ? (netProfitAfterAds / grossRevenue) * 100 : 0;

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
    ad_spend_month: Math.round(adSpend.total * 100) / 100,
    net_profit_after_ads_month: Math.round(netProfitAfterAds * 100) / 100,
    avg_margin_pct: Math.round(avgMargin * 10) / 10,
    highest_margin_product: highestMarginProduct,
  });
}
