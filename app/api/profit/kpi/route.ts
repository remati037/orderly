import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchRevenue } from "@/lib/metrics";
import { loadFxSettings } from "@/lib/utils/fx";
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

  // This month's revenue per lib/metrics: gross, refunds made this month, net,
  // and net profit minus the refunded share.
  const [revenue, productsRes] = await Promise.all([
    fetchRevenue(supabase, { start, end, rates: fx.rates }),
    supabase
      .from("products")
      .select("name, cost_percent")
      .not("cost_percent", "is", null),
  ]);

  const netProfit = revenue.netProfit;

  // Subtract mapped Facebook ad spend for the same month.
  const adSpend = await getMappedSpend(supabase, start.split("T")[0], end.split("T")[0], fx.rates);
  const netProfitAfterAds = netProfit - adSpend.total;
  const avgMargin = revenue.net > 0 ? (netProfitAfterAds / revenue.net) * 100 : 0;

  let highestMarginProduct: string | null = null;
  const products = productsRes.data ?? [];
  if (products.length > 0) {
    const sorted = [...products].sort(
      (a, b) => (a.cost_percent ?? 100) - (b.cost_percent ?? 100)
    );
    highestMarginProduct = sorted[0]?.name ?? null;
  }

  return NextResponse.json({
    gross_revenue_month: revenue.gross,
    refunds_month: revenue.refunds,
    net_revenue_month: revenue.net,
    net_profit_month: netProfit,
    ad_spend_month: Math.round(adSpend.total * 100) / 100,
    net_profit_after_ads_month: Math.round(netProfitAfterAds * 100) / 100,
    avg_margin_pct: Math.round(avgMargin * 10) / 10,
    highest_margin_product: highestMarginProduct,
  });
}
