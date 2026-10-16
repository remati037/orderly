import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { periodBounds } from "@/lib/utils/kpi-period";
import { fetchRevenue } from "@/lib/metrics";

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp            = new URL(request.url).searchParams;
  const preset        = sp.get("preset") ?? "today";
  const compare       = sp.get("compare") ?? "prev";
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

  const { current, prev, prevFull } = periodBounds(preset, from, to, compare);
  const q = { rates: fx.rates, siteId, products };

  // Revenue = net revenue (gross − refunds made in the period), see lib/metrics.
  const [currentData, prevData, prevFullData] = await Promise.all([
    fetchRevenue(supabase, { ...q, ...current }),
    fetchRevenue(supabase, { ...q, ...prev }),
    prevFull ? fetchRevenue(supabase, { ...q, ...prevFull }) : null,
  ]);

  return NextResponse.json({
    base_currency:   fx.baseCurrency,
    revenue_current: currentData.net,
    // Comparison window of the same length as `current` (fair basis for trends).
    revenue_prev:    prevData.net,
    // this_month only: the whole previous month, shown as a total.
    revenue_prev_full: prevFullData?.net ?? null,
    current_start:   current.start,
    current_end:     current.end,
    prev_start:      prev.start,
    prev_end:        prev.end,
    orders_current:  currentData.orders,
    orders_prev:     prevData.orders,
    aov_current:     currentData.aov,
    aov_prev:        prevData.aov,
    net_profit:      currentData.netProfit,
    stripe_fees:     currentData.fees,
    gross_current:   currentData.gross,
    refunds_current: currentData.refunds,
    refund_count_current: currentData.refundCount,
    refunds_prev:    prevData.refunds,
    active_sites:    activeSitesRes.count ?? 0,
  });
}
