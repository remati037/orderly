import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { periodBounds, compareLabel, compareOptions, parseCompare } from "@/lib/utils/kpi-period";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

type Row = { site_id: string; total: number | null; currency: string | null };

// Revenue, orders, AOV and share per site for the selected KPI period, plus the
// same figures for the comparison window (same presets/compare as /api/stats/kpi).
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp      = new URL(request.url).searchParams;
  const preset  = sp.get("preset") ?? "today";
  const compare = sp.get("compare") ?? "prev";
  const { current, prev } = periodBounds(preset, sp.get("from"), sp.get("to"), compare);

  const supabase = adminClient();
  const window = (b: { start: string; end: string }) =>
    fetchAll<Row>(() =>
      supabase
        .from("orders")
        .select("site_id, total, currency")
        .gte("created_at", b.start)
        .lt("created_at", b.end)
        .in("status", COUNTED_STATUSES)
        .order("id")
    );

  const [fx, sitesRes, cur, prv] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("id, name, color_hex, platform, created_at").order("created_at"),
    window(current),
    window(prev),
  ]);
  if (cur.error || prv.error)
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });

  const sum = (rows: Row[]) => {
    const m = new Map<string, { revenue: number; orders: number }>();
    for (const r of rows) {
      const e = m.get(r.site_id) ?? { revenue: 0, orders: 0 };
      e.revenue += toBase(r.total ?? 0, r.currency ?? "RSD", fx.rates);
      e.orders += 1;
      m.set(r.site_id, e);
    }
    return m;
  };
  const now = sum(cur.data);
  const before = sum(prv.data);
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
    .filter((s) => s.revenue > 0 || s.prev_revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const mode = parseCompare(compare);
  return NextResponse.json({
    base_currency: fx.baseCurrency,
    compare_label: compareLabel(preset, compareOptions(preset).includes(mode) ? mode : compareOptions(preset)[0]),
    total_revenue: totalRevenue,
    total_orders: cur.data.length,
    prev_total_revenue: [...before.values()].reduce((s, v) => s + v.revenue, 0),
    sites,
  });
}
