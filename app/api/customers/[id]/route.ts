import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !customer)
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [ordersRes, subsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, woo_order_id, source, status, total, net_profit, currency, product_type, payment_type, payment_method, created_at, updated_at, site_id, sites(name, color_hex, platform), order_items(product_name, product_type, quantity, price)"
      )
      .eq("customer_email", customer.email)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", customer.id)
      .eq("status", "active"),
  ]);

  const orders = ordersRes.data ?? [];
  const completed = orders.filter(
    (o) => !["cancelled", "refunded", "failed"].includes(o.status)
  );

  const totalSpent = completed.reduce((s, o) => s + toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates), 0);
  const netSpent = completed.reduce((s, o) => s + toBase(o.net_profit ?? 0, o.currency ?? "RSD", fx.rates), 0);
  const orderCount = completed.length;
  const aov = orderCount > 0 ? totalSpent / orderCount : 0;

  const monthsSinceFirst = customer.first_order_at
    ? Math.max(
        1,
        (Date.now() - new Date(customer.first_order_at).getTime()) /
          (30 * 24 * 3600 * 1000)
      )
    : 1;
  const ltv = Math.round(totalSpent / monthsSinceFirst);

  const segment =
    totalSpent >= 500
      ? "VIP"
      : totalSpent >= 100
      ? "Regular"
      : "New";

  return NextResponse.json({
    customer,
    orders,
    stats: {
      total_spent: totalSpent,
      net_spent: netSpent,
      order_count: orderCount,
      ltv,
      aov,
      active_subscriptions: subsRes.count ?? 0,
    },
    segment,
  });
}
