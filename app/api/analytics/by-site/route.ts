import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { periodBounds, compareLabel, compareOptions, parseCompare } from "@/lib/utils/kpi-period";
import {
  fetchPaidOrders, fetchRefunds, summarizeRevenueBy, type RevenueOrder, type RevenueRefund,
} from "@/lib/metrics";

type Row = RevenueOrder & { site_id: string };
type RefundRow = RevenueRefund & { site_id: string };

// Revenue, orders, AOV and share per site for the selected KPI period, plus the
// same figures for the comparison window (same presets/compare as /api/stats/kpi).
// Revenue is net revenue (gross − refunds made in the window), see lib/metrics.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp      = new URL(request.url).searchParams;
  const preset  = sp.get("preset") ?? "today";
  const compare = sp.get("compare") ?? "prev";
  const { current, prev } = periodBounds(preset, sp.get("from"), sp.get("to"), compare);

  const supabase = adminClient();
  const window = async (b: { start: string; end: string }) => {
    const [orders, refunds] = await Promise.all([
      fetchPaidOrders<Row>(supabase, b, "site_id"),
      fetchRefunds<RefundRow>(supabase, b, "site_id"),
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

  const sum = (w: { orders: Row[]; refunds: RefundRow[] }) => {
    const bySite = summarizeRevenueBy(w.orders, w.refunds, fx.rates, (o) => o.site_id, (r) => r.site_id);
    return new Map([...bySite].map(([k, s]) => [k, { revenue: s.net, orders: s.orders }]));
  };
  const now = sum(cur);
  const before = sum(prv);
  const totalRevenue = [...now.values()].reduce((s, v) => s + v.revenue, 0);

  const sites = (sitesRes.data ?? [])
    .map((s) => {
      const c = now.get(s.id) ?? { revenue: 0, orders: 0 };
      const p = before.get(s.id) ?? { revenue: 0, orders: 0 };
      return {
        site_id: s.id,
        name: s.name,
        color: s.color_hex,
        platform: s.platform,
        revenue: c.revenue,
        orders: c.orders,
        aov: c.orders ? c.revenue / c.orders : 0,
        share: totalRevenue ? c.revenue / totalRevenue : 0,
        prev_revenue: p.revenue,
        prev_orders: p.orders,
        trend: p.revenue ? (c.revenue - p.revenue) / p.revenue : null,
      };
    })
    .filter((s) => s.revenue !== 0 || s.prev_revenue !== 0)
    .sort((a, b) => b.revenue - a.revenue);

  const mode = parseCompare(compare);
  return NextResponse.json({
    base_currency: fx.baseCurrency,
    compare_label: compareLabel(preset, compareOptions(preset).includes(mode) ? mode : compareOptions(preset)[0]),
    total_revenue: totalRevenue,
    total_orders: cur.orders.length,
    prev_total_revenue: [...before.values()].reduce((s, v) => s + v.revenue, 0),
    sites,
  });
}
