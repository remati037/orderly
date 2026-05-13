import { SupabaseClient } from "@supabase/supabase-js";
import { upsertCustomer, logSync } from "./db";

interface ThinkificSite {
  id: string;
  name: string;
  subdomain: string;
  thinkific_api_key: string;
  default_margin_percent: number;
}

interface ThinkificOrder {
  id: number;
  status: string;
  amount_dollars: number;
  payment_type: string;
  product_name: string;
  user: { id: number; email: string; first_name: string; last_name: string };
  created_at: string;
}

interface ThinkificEnrollment {
  id: number;
  course_name: string;
  is_free_trial: boolean;
  user: { id: number; email: string; first_name: string; last_name: string };
  activated_at: string;
}

interface ThinkificPage<T> {
  items: T[];
  meta: { pagination: { next_page: number | null } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function thinkificGet<T>(
  subdomain: string,
  apiKey: string,
  path: string,
  page: number,
  limit = 25
): Promise<ThinkificPage<T> | null> {
  const url =
    `https://${subdomain}.thinkific.com/api/public/v1${path}` +
    `?page=${page}&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-Auth-API-Key": apiKey,
        "X-Auth-Subdomain": subdomain,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function upsertThinkificOrder(
  supabase: SupabaseClient,
  siteId: string,
  thinkificId: string,
  orderData: {
    status: string;
    total: number;
    paymentType: string;
    productName: string;
    customerEmail: string;
    customerName: string;
    marginPercent: number;
  }
): Promise<string | null> {
  const { total, marginPercent, paymentType } = orderData;
  const netProfit = total * (marginPercent / 100);

  const { data: row, error } = await supabase
    .from("orders")
    .upsert(
      {
        site_id: siteId,
        woo_order_id: thinkificId,
        source: "thinkific",
        status: orderData.status,
        total,
        net_profit: netProfit,
        currency: "USD",
        customer_name: orderData.customerName,
        customer_email: orderData.customerEmail,
        product_type: "digital",
        payment_type: paymentType,
        woo_data: orderData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,woo_order_id" }
    )
    .select("id")
    .single();

  if (error || !row) return null;

  await supabase.from("order_items").delete().eq("order_id", row.id);
  await supabase.from("order_items").insert({
    order_id: row.id,
    product_name: orderData.productName,
    product_type: "digital",
    quantity: 1,
    price: total,
    cost: 0,
  });

  return row.id as string;
}

export async function syncThinkificSite(
  supabase: SupabaseClient,
  site: ThinkificSite,
  logType: "manual" | "cron" = "manual"
): Promise<number> {
  const { id: siteId, subdomain, thinkific_api_key: apiKey } = site;
  const marginPercent = site.default_margin_percent ?? 100;
  let synced = 0;

  // ── sync orders ────────────────────────────────────────────────────────────
  let page = 1;
  while (true) {
    const data = await thinkificGet<ThinkificOrder>(
      subdomain,
      apiKey,
      "/orders",
      page
    );
    if (!data || !data.items.length) break;

    for (const order of data.items) {
      try {
        const customerName =
          `${order.user.first_name} ${order.user.last_name}`.trim();
        const paymentType =
          order.payment_type === "subscription" ? "subscription" : "one-time";
        const status =
          order.status === "Complete" ? "completed" : "pending";

        const orderId = await upsertThinkificOrder(supabase, siteId, order.id.toString(), {
          status,
          total: order.amount_dollars ?? 0,
          paymentType,
          productName: order.product_name ?? "",
          customerEmail: order.user.email,
          customerName,
          marginPercent,
        });

        if (orderId) {
          await upsertCustomer(
            supabase,
            order.user.email,
            customerName,
            order.amount_dollars ?? 0
          );

          if (paymentType === "subscription") {
            const { data: customer } = await supabase
              .from("customers")
              .select("id")
              .eq("email", order.user.email)
              .maybeSingle();

            await supabase.from("subscriptions").upsert(
              {
                site_id: siteId,
                customer_id: customer?.id ?? null,
                product_name: order.product_name ?? "",
                mrr: order.amount_dollars ?? 0,
                status: "active",
                started_at: order.created_at,
              },
              { onConflict: "id" }
            );
          }
          synced++;
        }
      } catch {
        // Skip bad orders
      }
    }

    if (!data.meta.pagination.next_page) break;
    page++;
    await sleep(1000);
  }

  // ── sync free/trial enrollments ────────────────────────────────────────────
  page = 1;
  while (true) {
    const data = await thinkificGet<ThinkificEnrollment>(
      subdomain,
      apiKey,
      "/enrollments",
      page
    );
    if (!data || !data.items.length) break;

    for (const enrollment of data.items) {
      if (!enrollment.is_free_trial) continue;

      try {
        const customerName =
          `${enrollment.user.first_name} ${enrollment.user.last_name}`.trim();
        const thinkificId = `enroll_${enrollment.id}`;

        const orderId = await upsertThinkificOrder(
          supabase,
          siteId,
          thinkificId,
          {
            status: "completed",
            total: 0,
            paymentType: "free_enrollment",
            productName: enrollment.course_name ?? "",
            customerEmail: enrollment.user.email,
            customerName,
            marginPercent,
          }
        );

        if (orderId) {
          await upsertCustomer(
            supabase,
            enrollment.user.email,
            customerName,
            0
          );
          synced++;
        }
      } catch {
        // Skip bad enrollments
      }
    }

    if (!data.meta.pagination.next_page) break;
    page++;
    await sleep(1000);
  }

  await logSync(supabase, siteId, logType, "success", synced);
  return synced;
}
