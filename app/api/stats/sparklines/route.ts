import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { dayBounds } from "@/lib/utils/tz";

const EXCLUDED_STATUSES = ["cancelled", "refunded", "failed"];
const TZ = "Europe/Belgrade";

type OrderRow = {
  total: number | null;
  currency: string | null;
  created_at: string;
};

// Belgrade-local YYYY-MM-DD for a given instant.
function belgradeDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp            = new URL(request.url).searchParams;
  const days          = Math.min(30, Math.max(2, Number(sp.get("days") ?? 7)));
  const siteId        = sp.get("siteId");
  const productsParam = sp.get("products");
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : null;

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  // Build the list of Belgrade day labels, oldest → newest.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(belgradeDay(dayBounds(-i).start));
  }
  const from = dayBounds(-(days - 1)).start;

  let rows: OrderRow[] = [];
  if (products?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("orders")
      .select("total, currency, created_at, order_items!inner(product_name)")
      .gte("created_at", from)
      .not("status", "in", `(${EXCLUDED_STATUSES.join(",")})`)
      .in("order_items.product_name", products);
    if (siteId) q = q.eq("site_id", siteId);
    const { data } = (await q) as { data: OrderRow[] | null };
    rows = data ?? [];
  } else {
    let q = supabase
      .from("orders")
      .select("total, currency, created_at")
      .gte("created_at", from)
      .not("status", "in", `(${EXCLUDED_STATUSES.join(",")})`);
    if (siteId) q = q.eq("site_id", siteId);
    const { data } = await q;
    rows = (data as OrderRow[]) ?? [];
  }

  const revByDay   = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  const countByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));

  for (const o of rows) {
    const key = belgradeDay(o.created_at);
    if (!revByDay.has(key)) continue;
    revByDay.set(key, revByDay.get(key)! + toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates));
    countByDay.set(key, countByDay.get(key)! + 1);
  }

  const revenue = dayKeys.map((k) => Math.round(revByDay.get(k)!));
  const orders  = dayKeys.map((k) => countByDay.get(k)!);
  const aov     = dayKeys.map((k, i) => (orders[i] > 0 ? Math.round(revenue[i] / orders[i]) : 0));

  return NextResponse.json({ labels: dayKeys, revenue, orders, aov });
}
