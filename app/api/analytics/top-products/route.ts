import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? 10)));
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = adminClient();

  let query = supabase
    .from("order_items")
    .select("product_name, product_type, quantity, price, order:orders!inner(site_id, status, created_at)")
    .not("order.status", "in", "(cancelled,refunded)");

  if (siteId) query = query.eq("order.site_id", siteId);
  if (from) query = query.gte("order.created_at", from);
  if (to) query = query.lt("order.created_at", to);

  const { data, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by product name
  const map = new Map<string, { name: string; type: string; revenue: number; units: number }>();

  for (const item of data ?? []) {
    const key = item.product_name ?? "Nepoznat proizvod";
    const existing = map.get(key);
    const revenue = (item.price ?? 0) * (item.quantity ?? 1);
    if (existing) {
      existing.revenue += revenue;
      existing.units += item.quantity ?? 1;
    } else {
      map.set(key, {
        name: key,
        type: item.product_type ?? "physical",
        revenue,
        units: item.quantity ?? 1,
      });
    }
  }

  const products = [...map.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  return NextResponse.json({ products });
}
