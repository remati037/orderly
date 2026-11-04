import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { getMappedSpend } from "@/lib/utils/ad-spend";
import { belgradeDateRange } from "@/lib/utils/tz";
import { periodBounds, compareLabel, compareOptions, parseCompare } from "@/lib/utils/kpi-period";
import {
  fetchPaidOrders, fetchRefunds, summarizeRevenueBy, relativeChange, type RevenueOrder, type RevenueRefund,
} from "@/lib/metrics";

type Row = RevenueOrder & { site_id: string };
type RefundRow = RevenueRefund & { site_id: string };

// Revenue, orders, AOV, net profit, fees, Facebook ad spend and share per site for the selected KPI
// period, plus changes vs the comparison window (same filters as /api/stats/kpi).
// Revenue is net revenue (gross − refunds made in the window), see lib/metrics.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp      = new URL(request.url).searchParams;
  const preset  = sp.get("preset") ?? "today";
  const compare = sp.get("compare") ?? "prev";
  const products = sp.get("products")?.split(",").filter(Boolean) ?? null;
  const { current, prev } = periodBounds(preset, sp.get("from"), sp.get("to"), compare);

  const supabase = adminClient();
  const window = async (b: { start: string; end: string }) => {
    const [orders, refunds] = await Promise.all([
      fetchPaidOrders<Row>(supabase, { ...b, products }, "site_id"),
      fetchRefunds<RefundRow>(supabase, { ...b, products }, "site_id"),
    ]);
    return { orders: orders.data, refunds: refunds.data, error: orders.error ?? refunds.error };
  };

  const [fx, sitesRes, cur, prv] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("id, name, color_hex, platform, created_at").order("created_at"),
    window(current),
    window(prev),
  ]);
  if (cur.error || prv.error)
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });

  // Ads pay for a site, not a product, so a product filter has no spend to show.
  const range = belgradeDateRange(current.start, current.end);
  const adSpend = products?.length ? null : await getMappedSpend(supabase, range.from, range.to, fx.rates);

  const sum = (w: { orders: Row[]; refunds: RefundRow[] }) => {
    const bySite = summarizeRevenueBy(w.orders, w.refunds, fx.rates, (o) => o.site_id, (r) => r.site_id);
    return new Map([...bySite].map(([k, s]) => [k, { revenue: s.net, orders: s.orders, netProfit: s.netProfit, fees: s.fees }]));
  };
  const aovOf = (revenue: number, orders: number) => (orders ? revenue / orders : 0);
  // AOV only compares when both windows have orders; otherwise it's a jump from/to nothing.
  const aovChange = (r: number, o: number, pr: number, po: number) =>
    o && po ? relativeChange(aovOf(r, o), aovOf(pr, po)) : null;
  const now = sum(cur);
  const before = sum(prv);
  const total = (m: typeof now, key: "revenue" | "netProfit" | "fees") =>
    [...m.values()].reduce((s, v) => s + v[key], 0);
  const totalRevenue = total(now, "revenue");
  const prevTotalRevenue = total(before, "revenue");

  const sites = (sitesRes.data ?? [])
    .map((s) => {
      const c = now.get(s.id) ?? { revenue: 0, orders: 0, netProfit: 0, fees: 0 };
      const p = before.get(s.id) ?? { revenue: 0, orders: 0, netProfit: 0, fees: 0 };
      return {
        site_id: s.id,
        name: s.name,
        color: s.color_hex,
        platform: s.platform,
        revenue: c.revenue,
        orders: c.orders,
        aov: aovOf(c.revenue, c.orders),
        net_profit: c.netProfit,
        fees: c.fees,
        ad_spend: adSpend ? adSpend.bySite[s.id] ?? 0 : null,
        share: totalRevenue ? c.revenue / totalRevenue : 0,
        prev_revenue: p.revenue,
        prev_orders: p.orders,
        trend: relativeChange(c.revenue, p.revenue),
        orders_trend: relativeChange(c.orders, p.orders),
        aov_trend: aovChange(c.revenue, c.orders, p.revenue, p.orders),
      };
    })
    .filter((s) => s.revenue !== 0 || s.prev_revenue !== 0 || !!s.ad_spend)
    .sort((a, b) => b.revenue - a.revenue);

  const mode = parseCompare(compare);
  return NextResponse.json({
    base_currency: fx.baseCurrency,
    compare_label: compareLabel(preset, compareOptions(preset).includes(mode) ? mode : compareOptions(preset)[0]),
    total_revenue: totalRevenue,
    total_orders: cur.orders.length,
    prev_total_revenue: prevTotalRevenue,
    total_revenue_trend: relativeChange(totalRevenue, prevTotalRevenue),
    total_orders_trend: relativeChange(cur.orders.length, prv.orders.length),
    total_aov: aovOf(totalRevenue, cur.orders.length),
    total_aov_trend: aovChange(totalRevenue, cur.orders.length, prevTotalRevenue, prv.orders.length),
    total_net_profit: total(now, "netProfit"),
    total_fees: total(now, "fees"),
    total_ad_spend: adSpend ? adSpend.total : null,
    sites,
  });
}
