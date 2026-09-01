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

  const byBucket = new Map<string, number>(); // `${siteId}:${kind}`

  for (const row of rows) {
    const revenue = toBase(row.total ?? 0, row.currency ?? "RSD", fx.rates);
    const productName = row.order_items?.[0]?.product_name;

    const kind: BucketKind =
      productName && subNames.has(productName)
        ? subscriptionSeq.has(row.id) ? "renewal" : "new"
        : "onetime";

    const key = `${row.site_id}:${kind}`;
    byBucket.set(key, (byBucket.get(key) ?? 0) + revenue);
  }

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
