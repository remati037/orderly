import { SupabaseClient } from "@supabase/supabase-js";

// ── types ──────────────────────────────────────────────────────────────────────

export interface WooLineItem {
  name: string;
  quantity: number;
  total: string;
  weight?: string;
  dimensions?: { length: string; width: string; height: string };
}

export interface WooOrder {
  id: number;
  status: string;
  total: string;
  currency: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    city: string;
  };
  line_items: WooLineItem[];
}

export interface NormalizedWooOrder {
  orderRow: {
    site_id: string;
    woo_order_id: string;
    source: "woocommerce";
    status: string;
    total: number;
    net_profit: number;
    currency: string;
    customer_name: string;
    customer_email: string;
    customer_city: string;
    product_type: "digital" | "physical";
    payment_type: "one-time";
    woo_data: WooOrder;
    updated_at: string;
  };
  itemRows: Array<{
    product_name: string;
    product_type: "digital" | "physical";
    quantity: number;
    price: number;
    cost: number;
  }>;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function itemIsDigital(item: WooLineItem): boolean {
  return (
    !item.weight &&
    (!item.dimensions ||
      (!item.dimensions.length &&
        !item.dimensions.width &&
        !item.dimensions.height))
  );
}

function detectProductType(
  lineItems: WooLineItem[]
): "digital" | "physical" {
  return lineItems.some(itemIsDigital) ? "digital" : "physical";
}

async function calcNetProfit(
  supabase: SupabaseClient,
  siteId: string,
  lineItems: WooLineItem[],
  orderTotal: number,
  marginPercent: number
): Promise<number> {
  if (lineItems.length === 0) {
    return Math.max(0, orderTotal * (marginPercent / 100));
  }

  let net = 0;
  for (const item of lineItems) {
    const itemTotal = parseFloat(item.total ?? "0");
    const qty = item.quantity ?? 1;

    const { data: product } = await supabase
      .from("products")
      .select("cost_percent, cost_fixed")
      .eq("site_id", siteId)
      .ilike("name", item.name)
      .maybeSingle();

    if (product?.cost_percent != null) {
      net += itemTotal * (1 - product.cost_percent / 100);
    } else if (product?.cost_fixed != null) {
      net += itemTotal - product.cost_fixed * qty;
    } else {
      net += itemTotal * (marginPercent / 100);
    }
  }
  return Math.max(0, net);
}

// ── main export ────────────────────────────────────────────────────────────────

export async function normalizeWooOrder(
  supabase: SupabaseClient,
  order: WooOrder,
  siteId: string,
  marginPercent: number
): Promise<NormalizedWooOrder> {
  const lineItems: WooLineItem[] = order.line_items ?? [];
  const total = parseFloat(order.total);

  return {
    orderRow: {
      site_id: siteId,
      woo_order_id: order.id.toString(),
      source: "woocommerce",
      status: order.status,
      total,
      net_profit: await calcNetProfit(
        supabase,
        siteId,
        lineItems,
        total,
        marginPercent
      ),
      currency: order.currency || "RSD",
      customer_name:
        `${order.billing.first_name} ${order.billing.last_name}`.trim(),
      customer_email: order.billing.email,
      customer_city: order.billing.city,
      product_type: detectProductType(lineItems),
      payment_type: "one-time",
      woo_data: order,
      updated_at: new Date().toISOString(),
    },
    itemRows: lineItems.map((item) => ({
      product_name: item.name,
      product_type: itemIsDigital(item) ? "digital" : "physical",
      quantity: item.quantity ?? 1,
      price: parseFloat(item.total ?? "0"),
      cost: 0,
    })),
  };
}
