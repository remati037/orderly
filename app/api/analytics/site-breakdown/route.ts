import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { periodBounds } from "@/lib/utils/kpi-period";
import { fetchPaidOrders, fetchRefunds, type RevenueOrder, type RevenueRefund } from "@/lib/metrics";
import { computeSubscriptionOrdinals } from "@/lib/utils/subscription-ordinal";

type OrderInfo = {
  id: string;
  customer_email: string | null;
  created_at: string;
  order_items: { product_name: string }[] | null;
};

type OrderRow = RevenueOrder & OrderInfo & { site_id: string };
type RefundRow = RevenueRefund & { site_id: string; order_id: string };

type BucketKind = "onetime" | "new" | "renewal";

const FALLBACK_COLOR = "#71717A";

const BUCKET_ORDER: BucketKind[] = ["onetime", "new", "renewal"];

const BUCKET_LABEL: Record<BucketKind, string> = {
  onetime: "jednokratno",
  new:     "nova pretplata",
  renewal: "ponovljena pretplata",
};

// Mix a hex color toward white (amount > 0) or black (amount < 0) so each site
// keeps its own hue and only the shade tells the buckets apart.
function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (full.length !== 6 || Number.isNaN(parseInt(full, 16))) return hex;
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const channel = (i: number) => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16);
    return Math.round(v + (target - v) * t).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

const BUCKET_SHADE: Record<BucketKind, (color: string) => string> = {
  onetime: (c) => c,
  new:     (c) => shade(c, 0.45),
  renewal: (c) => shade(c, -0.35),
};

// Revenue by site for the currently selected KPI period — powers the
// proportional bar under the Dashboard metrics. Mirrors /api/stats/kpi's
// period handling (same presets, same product filter) but groups by site
// instead of collapsing to a single total. Each site stays a single entry;
// its revenue is split into one-time / new-subscription / renewal segments
// rendered as shades of the site color, using the same customer_email +
// product_name history check as the recovery board's subscription_seq badge.
// Revenue is net (see lib/metrics): refunds made in the period come off the
// site and bucket of the order they refund. A bucket never shows below zero.
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

  // With a product filter fetchPaidOrders already embeds order_items (inner).
  const extra = "id, site_id, customer_email, created_at" + (products?.length ? "" : ", order_items(product_name)");
  const q = { start: current.start, end: current.end, products };

  const [ordersRes, refundsRes] = await Promise.all([
    fetchPaidOrders<OrderRow>(supabase, q, extra),
    fetchRefunds<RefundRow>(supabase, q, "site_id, order_id"),
  ]);
  const error = ordersRes.error ?? refundsRes.error;
  if (error) return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  const rows = ordersRes.data;
  const refunds = refundsRes.data;

  // The refunded orders (usually created before the period), to bucket refunds.
  const refundedIds = [...new Set(refunds.map((r) => r.order_id))];
  const refundedRes = refundedIds.length
    ? await supabase
        .from("orders")
        .select("id, customer_email, created_at, order_items(product_name)")
        .in("id", refundedIds)
    : { data: [] as OrderInfo[] };
  const refundedOrders = new Map(((refundedRes.data ?? []) as OrderInfo[]).map((o) => [o.id, o]));
  const infos = new Map<string, OrderInfo>([...refundedOrders, ...rows.map((o) => [o.id, o] as const)]);

  const subscriptionSeq = await computeSubscriptionOrdinals(
    supabase,
    [...infos.values()].map((o) => ({
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

  const byBucket = new Map<string, number>(); // `${siteId}:${kind}`

  const kindOf = (o: OrderInfo | undefined): BucketKind => {
    const productName = o?.order_items?.[0]?.product_name;
    return o && productName && subNames.has(productName)
      ? subscriptionSeq.has(o.id) ? "renewal" : "new"
      : "onetime";
  };
  const add = (key: string, amount: number) => byBucket.set(key, (byBucket.get(key) ?? 0) + amount);

  for (const row of rows)
    add(`${row.site_id}:${kindOf(row)}`, toBase(Number(row.total ?? 0), row.currency ?? "RSD", fx.rates));
  for (const r of refunds)
    add(`${r.site_id}:${kindOf(infos.get(r.order_id))}`, -toBase(Number(r.amount), r.currency, fx.rates));

  // Shares of a bar can't be negative: drop buckets that refunds took to ≤ 0.
  for (const [k, v] of byBucket) if (v <= 0) byBucket.delete(k);

  const total = Array.from(byBucket.values()).reduce((s, v) => s + v, 0);
  const sites = sitesRes.data ?? [];
  const pct = (revenue: number) => (total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0);

  const siteIds = Array.from(new Set(Array.from(byBucket.keys()).map((k) => k.split(":")[0])));

  const breakdown = siteIds
    .map((siteId) => {
      const site = sites.find((s) => s.id === siteId);
      const color = site?.color_hex ?? FALLBACK_COLOR;

      const segments = BUCKET_ORDER.flatMap((kind) => {
        const revenue = byBucket.get(`${siteId}:${kind}`);
        if (!revenue) return [];
        return [{
          kind,
          label: BUCKET_LABEL[kind],
          color: BUCKET_SHADE[kind](color),
          revenue,
          pct: pct(revenue),
        }];
      });

      const revenue = segments.reduce((s, seg) => s + seg.revenue, 0);
      return {
        site_id: siteId,
        name: site?.name ?? "Nepoznat sajt",
        color,
        revenue,
        pct: pct(revenue),
        segments,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ breakdown, total, base_currency: fx.baseCurrency });
}
