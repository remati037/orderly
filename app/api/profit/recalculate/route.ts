import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

const BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const from = Math.max(0, Number(body.from ?? 0));

  const supabase = adminClient();

  const [sitesRes, productsRes, countRes] = await Promise.all([
    supabase.from("sites").select("id, default_margin_percent"),
    supabase
      .from("products")
      .select("site_id, name, cost_percent, cost_fixed"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .not("status", "in", "(cancelled,refunded,failed)"),
  ]);

  const total = countRes.count ?? 0;
  const siteMap = new Map(
    (sitesRes.data ?? []).map((s) => [s.id, s])
  );
  const productMap = new Map(
    (productsRes.data ?? []).map((p) => [`${p.site_id}::${p.name}`, p])
  );

  const ordersRes = await supabase
    .from("orders")
    .select("id, site_id, total, payment_method, woo_data")
    .not("status", "in", "(cancelled,refunded,failed)")
    .order("created_at")
    .range(from, from + BATCH_SIZE - 1);

  const orders = ordersRes.data ?? [];

  if (orders.length === 0) {
    return NextResponse.json({ total, processed: from, next_from: from, done: true });
  }

  const orderIds = orders.map((o) => o.id);

  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, product_name, price, quantity")
    .in("order_id", orderIds);

  const itemsByOrder = new Map<
    string,
    { order_id: string; product_name: string | null; price: number | null; quantity: number | null }[]
  >();
  for (const item of items ?? []) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  await Promise.all(
    orders.map(async (order) => {
      const orderItems = itemsByOrder.get(order.id) ?? [];
      const site = siteMap.get(order.site_id);
      const defaultMargin = site?.default_margin_percent ?? 50;

      const wooData = order.woo_data as { payment_method?: string } | null;
      const paymentMethod = (order as { payment_method?: string | null }).payment_method ?? wooData?.payment_method ?? "";
      const isCardPayment = /stripe/i.test(paymentMethod);
      const revenueMultiplier = isCardPayment ? 0.95 : 1;

      let netProfit = 0;

      if (orderItems.length === 0) {
        netProfit = (order.total ?? 0) * revenueMultiplier * (defaultMargin / 100);
      } else {
        for (const item of orderItems) {
          const price = item.price ?? 0;
          const qty = item.quantity ?? 1;
          const revenue = price * qty * revenueMultiplier;
          const key = `${order.site_id}::${item.product_name}`;
          const override = productMap.get(key);

          if (override?.cost_percent != null) {
            netProfit += revenue * (1 - override.cost_percent / 100);
          } else if (override?.cost_fixed != null) {
            netProfit += revenue - override.cost_fixed * qty;
          } else {
            netProfit += revenue * (defaultMargin / 100);
          }
        }
      }

      await supabase
        .from("orders")
        .update({
          net_profit: Math.round(netProfit * 100) / 100,
          payment_method: paymentMethod || null,
        })
        .eq("id", order.id);
    })
  );

  const nextFrom = from + orders.length;
  const done = nextFrom >= total;

  return NextResponse.json({ total, processed: nextFrom, next_from: nextFrom, done });
}
