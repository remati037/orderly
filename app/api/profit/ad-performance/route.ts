import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { getMappedSpend } from "@/lib/utils/ad-spend";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { monthBounds } from "@/lib/utils/tz";

interface Row {
  site_id: string;
  site_name: string;
  site_color: string;
  product_name: string | null; // null = spend mapped to the whole site, no product
  spend: number;
  revenue: number;
  roas: number | null;
}

// Ad spend vs. the revenue it actually produced, by (site, product) — joins
// getMappedSpend's byProduct/bySite breakdown (already computed for
// /api/profit/kpi) with real order revenue for the same period.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp    = new URL(request.url).searchParams;
  const month = monthBounds();
  const from  = sp.get("from") ?? month.start.split("T")[0];
  const to    = sp.get("to")   ?? month.end.split("T")[0];

  const supabase = adminClient();
  const [fx, sitesRes] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("id, name, color_hex"),
  ]);

  const spend = await getMappedSpend(supabase, from, to, fx.rates);
  const sites = sitesRes.data ?? [];

  // Revenue per (site_id, product_name) for the same window — mirrors
  // /api/analytics/top-products but keyed per-site too, to match spend.byProduct.
  const { data: items } = await fetchAll(() =>
    supabase
      .from("order_items")
      .select("product_name, price, quantity, order:orders!inner(site_id, status, created_at, currency)")
      .in("order.status", COUNTED_STATUSES)
      .gte("order.created_at", from)
      .lt("order.created_at", to)
      .order("id")
  );

  const revenueByProduct = new Map<string, number>(); // "site_id::product_name"
  const revenueBySite = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of (items ?? []) as any[]) {
    const order = item.order;
    const rev = toBase((item.price ?? 0) * (item.quantity ?? 1), order?.currency ?? "RSD", fx.rates);
    revenueBySite.set(order.site_id, (revenueBySite.get(order.site_id) ?? 0) + rev);
    if (item.product_name) {
      const key = `${order.site_id}::${item.product_name}`;
      revenueByProduct.set(key, (revenueByProduct.get(key) ?? 0) + rev);
    }
  }

  const rows: Row[] = [];

  for (const [key, productSpend] of Object.entries(spend.byProduct)) {
    const [siteId, productName] = key.split("::");
    const site = sites.find((s) => s.id === siteId);
    const revenue = revenueByProduct.get(key) ?? 0;
    rows.push({
      site_id: siteId,
      site_name: site?.name ?? "Nepoznat sajt",
      site_color: site?.color_hex ?? "#71717A",
      product_name: productName,
      spend: Math.round(productSpend * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      roas: productSpend > 0 ? Math.round((revenue / productSpend) * 100) / 100 : null,
    });
  }

  // Spend mapped to a whole site (no specific product) — its own row.
  for (const [siteId, siteSpend] of Object.entries(spend.bySite)) {
    const productSpendForSite = Object.entries(spend.byProduct)
      .filter(([key]) => key.startsWith(`${siteId}::`))
      .reduce((s, [, v]) => s + v, 0);
    const wholeSiteSpend = siteSpend - productSpendForSite;
    if (wholeSiteSpend <= 0) continue;

    const site = sites.find((s) => s.id === siteId);
    const revenue = revenueBySite.get(siteId) ?? 0;
    rows.push({
      site_id: siteId,
      site_name: site?.name ?? "Nepoznat sajt",
      site_color: site?.color_hex ?? "#71717A",
      product_name: null,
      spend: Math.round(wholeSiteSpend * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      roas: wholeSiteSpend > 0 ? Math.round((revenue / wholeSiteSpend) * 100) / 100 : null,
    });
  }

  rows.sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    rows,
    total_spend: Math.round(spend.total * 100) / 100,
    base_currency: fx.baseCurrency,
  });
}
