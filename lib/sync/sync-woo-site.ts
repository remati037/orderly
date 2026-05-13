import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWooOrder, WooOrder } from "./normalize-woo-order";
import { upsertWooOrder, upsertCustomer, logSync } from "./db";

interface WooSite {
  id: string;
  name: string;
  url: string;
  consumer_key: string;
  consumer_secret: string;
  default_margin_percent: number;
}

export async function syncWooSite(
  supabase: SupabaseClient,
  site: WooSite,
  logType: "manual" | "cron" = "manual"
): Promise<number> {
  const auth = Buffer.from(
    `${site.consumer_key}:${site.consumer_secret}`
  ).toString("base64");

  let page = 1;
  let synced = 0;

  while (true) {
    const url =
      `${site.url}/wp-json/wc/v3/orders` +
      `?per_page=100&page=${page}&orderby=date&order=asc`;

    let orders: WooOrder[];
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) break;
      orders = await res.json();
    } catch {
      break;
    }

    if (!orders.length) break;

    for (const order of orders) {
      try {
        const normalized = await normalizeWooOrder(
          supabase,
          order,
          site.id,
          site.default_margin_percent ?? 100
        );
        const orderId = await upsertWooOrder(supabase, normalized);
        if (orderId && normalized.orderRow.customer_email) {
          await upsertCustomer(
            supabase,
            normalized.orderRow.customer_email,
            normalized.orderRow.customer_name,
            normalized.orderRow.total,
            normalized.orderRow.customer_city
          );
        }
        synced++;
      } catch {
        // Skip bad orders, keep going
      }
    }

    page++;
  }

  await logSync(supabase, site.id, logType, "success", synced);
  return synced;
}
