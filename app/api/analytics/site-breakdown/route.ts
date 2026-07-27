import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { periodBounds } from "@/lib/utils/kpi-period";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

type OrderRow = { site_id: string; total: number | null; currency: string | null };

// Revenue by site for the currently selected KPI period — powers the
// proportional bar under the Dashboard metrics. Mirrors /api/stats/kpi's
// period handling (same presets, same product filter) but groups by site
// instead of collapsing to a single total.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp            = new URL(request.url).searchParams;
  const preset        = sp.get("preset") ?? "today";
  const compare       = sp.get("compare") === "month" ? "month" : "day";
  const from          = sp.get("from");
  const to            = sp.get("to");
  const productsParam = sp.get("products");
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : null;

  const supabase = adminClient();

  const [fx, sitesRes] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("id, name, color_hex"),
  ]);

  const { current } = periodBounds(preset, from, to, compare);

  let data: OrderRow[] | null;
  let error: { message: string } | null;

  if (products?.length) {
    // Supabase TS cannot infer types for non-literal select strings; cast to any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supabase as any)
      .from("orders")
      .select("site_id, total, currency, order_items!inner(product_name)")
      .gte("created_at", current.start)
      .lt("created_at", current.end)
      .in("status", COUNTED_STATUSES)
      .in("order_items.product_name", products);
    data = res.data;
    error = res.error;
  } else {
    const res = await supabase
      .from("orders")
      .select("site_id, total, currency")
      .gte("created_at", current.start)
      .lt("created_at", current.end)
      .in("status", COUNTED_STATUSES);
    data = res.data;
    error = res.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bySite = new Map<string, number>();
  for (const row of data ?? []) {
    const revenue = toBase(row.total ?? 0, row.currency ?? "RSD", fx.rates);
    bySite.set(row.site_id, (bySite.get(row.site_id) ?? 0) + revenue);
  }

  const total = Array.from(bySite.values()).reduce((s, v) => s + v, 0);
  const sites = sitesRes.data ?? [];

  const breakdown = Array.from(bySite.entries())
    .map(([siteId, revenue]) => {
      const site = sites.find((s) => s.id === siteId);
      return {
        site_id: siteId,
        name: site?.name ?? "Nepoznat sajt",
        color: site?.color_hex ?? "#71717A",
        revenue,
        pct: total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ breakdown, total, base_currency: fx.baseCurrency });
}
