import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { periodBounds } from "@/lib/utils/kpi-period";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { computeSubscriptionOrdinals } from "@/lib/utils/subscription-ordinal";

type OrderRow = {
  id: string;
  site_id: string;
  total: number | null;
  currency: string | null;
  customer_email: string | null;
  created_at: string;
  order_items: { product_name: string }[] | null;
};

const NEW_SUB_COLOR = "#FCA5A5";
const RENEWAL_SUB_COLOR = "#7F1D1D";

// Revenue by site for the currently selected KPI period — powers the
// proportional bar under the Dashboard metrics. Mirrors /api/stats/kpi's
// period handling (same presets, same product filter) but groups by site
// instead of collapsing to a single total. Subscription revenue is further
// split into new-vs-renewal per site (two shades of red), using the same
// customer_email + product_name history check as the recovery board's
// subscription_seq badge.
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

  const select = "id, site_id, total, currency, customer_email, created_at, order_items(product_name)";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("orders")
    .select(products?.length ? select.replace("order_items(", "order_items!inner(") : select)
    .gte("created_at", current.start)
    .lt("created_at", current.end)
    .in("status", COUNTED_STATUSES);
  if (products?.length) q = q.in("order_items.product_name", products);

  const { data, error } = (await q) as { data: OrderRow[] | null; error: { message: string } | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  const subscriptionSeq = await computeSubscriptionOrdinals(
    supabase,
    rows.map((o) => ({
      id: o.id,
      customer_email: o.customer_email,
      product_name: o.order_items?.[0]?.product_name ?? null,
      created_at: o.created_at,
    }))
  );
  // seq is only set for the 2nd+ payment — an order absent from the map is
  // either a first payment or not a subscription product at all. Only the
  // orders we asked about (i.e. actual subscription products) matter here,
  // so re-derive "is this a subscription order" the same way the helper did.
  const subNamesRes = await supabase.from("subscriptions").select("product_name");
  const subNames = new Set((subNamesRes.data ?? []).map((r) => r.product_name).filter(Boolean) as string[]);

  const bySite = new Map<string, number>();
  const byBucket = new Map<string, number>(); // `${siteId}:new` | `${siteId}:renewal`

  for (const row of rows) {
    const revenue = toBase(row.total ?? 0, row.currency ?? "RSD", fx.rates);
    const productName = row.order_items?.[0]?.product_name;

    if (productName && subNames.has(productName)) {
      const bucketKey = `${row.site_id}:${subscriptionSeq.has(row.id) ? "renewal" : "new"}`;
      byBucket.set(bucketKey, (byBucket.get(bucketKey) ?? 0) + revenue);
    } else {
      bySite.set(row.site_id, (bySite.get(row.site_id) ?? 0) + revenue);
    }
  }

  const total =
    Array.from(bySite.values()).reduce((s, v) => s + v, 0) +
    Array.from(byBucket.values()).reduce((s, v) => s + v, 0);
  const sites = sitesRes.data ?? [];
  const pct = (revenue: number) => (total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0);

  const breakdown = [
    ...Array.from(bySite.entries()).map(([siteId, revenue]) => {
      const site = sites.find((s) => s.id === siteId);
      return {
        site_id: siteId,
        name: site?.name ?? "Nepoznat sajt",
        color: site?.color_hex ?? "#71717A",
        revenue,
        pct: pct(revenue),
      };
    }),
    ...Array.from(byBucket.entries()).map(([bucketKey, revenue]) => {
      const [siteId, kind] = bucketKey.split(":");
      const site = sites.find((s) => s.id === siteId);
      const siteName = site?.name ?? "Nepoznat sajt";
      return {
        site_id: bucketKey,
        name: kind === "new" ? `${siteName} — nova pretplata` : `${siteName} — ponovljena pretplata`,
        color: kind === "new" ? NEW_SUB_COLOR : RENEWAL_SUB_COLOR,
        revenue,
        pct: pct(revenue),
      };
    }),
  ].sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ breakdown, total, base_currency: fx.baseCurrency });
}
