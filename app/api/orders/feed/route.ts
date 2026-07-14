import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { dayBounds, weekBounds, monthBounds, yearBounds, customBounds } from "@/lib/utils/tz";

const EXCLUDED = "(cancelled,refunded,failed)";
const LIMIT = 30;

function feedBounds(preset: string, from: string | null, to: string | null) {
  switch (preset) {
    case "yesterday":  return dayBounds(-1);
    case "this_week":  return weekBounds(0);
    case "this_month": return monthBounds(0);
    case "this_year":  return yearBounds(0);
    case "custom":
      if (from && to) {
        const b = customBounds(from, to);
        return { start: b.start, end: b.end };
      }
      return dayBounds(0);
    default:           return dayBounds(0); // today
  }
}

// Recent orders for the dashboard filter window — powers the live feed when the
// selected period isn't "today" (the realtime channel only holds today).
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp       = new URL(request.url).searchParams;
  const preset   = sp.get("preset") ?? "today";
  const from     = sp.get("from");
  const to       = sp.get("to");
  const siteId   = sp.get("siteId");
  const products = (sp.get("products") ?? "").split(",").filter(Boolean);

  const { start, end } = feedBounds(preset, from, to);
  const supabase = adminClient();

  const select =
    "id, site_id, status, total, currency, customer_name, product_type, created_at, " +
    "sites(name, color_hex), order_items!inner(product_name)";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("orders")
    .select(products.length ? select : select.replace("!inner", ""))
    .gte("created_at", start)
    .lt("created_at", end)
    .not("status", "in", EXCLUDED)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (siteId) q = q.eq("site_id", siteId);
  if (products.length) q = q.in("order_items.product_name", products);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (data ?? []).map((o: any) => ({
    id: o.id,
    site_id: o.site_id,
    status: o.status,
    total: Number(o.total ?? 0),
    currency: o.currency ?? "RSD",
    customer_name: o.customer_name ?? null,
    product_type: o.product_type ?? "digital",
    product_name: o.order_items?.[0]?.product_name ?? null,
    site_name: o.sites?.name ?? "",
    site_color: o.sites?.color_hex ?? "#16A34A",
    is_late: false,
  }));

  return NextResponse.json({ orders });
}
