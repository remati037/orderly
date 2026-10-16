import { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchStripeRefunds,
  fetchWooRefunds,
  stripeRefundRows,
  unknownRefundIds,
  voidStripeRefundIds,
  wooRefundRows,
  type RefundRow,
  type WooOrderRefundRef,
} from "./refunds";

async function upsertRefunds(supabase: SupabaseClient, rows: RefundRow[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("refunds")
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), {
      onConflict: "site_id,source,external_id",
    });
  if (error) throw new Error(`refunds upsert: ${error.message}`);
}

/**
 * Bring one Woo order's refunds in line with its payload. Only refunds we
 * haven't stored are fetched (one API call, for their real date) and inserted;
 * refunds that disappeared from the order (deleted in Woo) are removed.
 * Never throws: a refund problem must not fail the order sync around it.
 */
export async function syncWooOrderRefunds(
  supabase: SupabaseClient,
  site: { id: string; url: string; consumer_key: string; consumer_secret: string },
  order: { id: number | string; refunds?: WooOrderRefundRef[] | null; currency?: string; date_modified_gmt?: string | null },
  orderId: string
): Promise<void> {
  try {
    const { data: stored } = await supabase
      .from("refunds")
      .select("external_id")
      .eq("order_id", orderId)
      .eq("source", "woocommerce");
    const known = (stored ?? []).map((r) => r.external_id as string);
    const current = new Set((order.refunds ?? []).map((r) => String(r.id)));

    const gone = known.filter((id) => !current.has(id));
    if (gone.length)
      await supabase.from("refunds").delete().eq("order_id", orderId).eq("source", "woocommerce").in("external_id", gone);

    const missing = unknownRefundIds(order, known);
    if (!missing.length) return;

    const details = await fetchWooRefunds(site, order.id).catch((err) => {
      console.error(`[refunds] Woo details for order ${order.id}:`, err.message);
      return [];
    });
    const rows = wooRefundRows(order, { orderId, siteId: site.id }, details)
      .filter((r) => missing.includes(Number(r.external_id)));
    await upsertRefunds(supabase, rows);
  } catch (err) {
    console.error(`[refunds] Woo order ${order.id}:`, (err as Error).message);
  }
}

/**
 * Store Stripe refunds for this site's charges. Refunds for charges we don't
 * have (other sites on a shared account, or skipped payments) are ignored.
 */
export async function saveStripeRefunds(
  supabase: SupabaseClient,
  siteId: string,
  refunds: Awaited<ReturnType<typeof fetchStripeRefunds>>
): Promise<number> {
  const charges = [...new Set(refunds.map((r) => r.charge).filter((c): c is string => !!c))];
  if (!charges.length) return 0;

  const orderIdByCharge = new Map<string, string>();
  for (let i = 0; i < charges.length; i += 200) {
    const { data } = await supabase
      .from("orders")
      .select("id, woo_order_id")
      .eq("site_id", siteId)
      .eq("source", "stripe")
      .in("woo_order_id", charges.slice(i, i + 200));
    for (const o of data ?? []) orderIdByCharge.set(o.woo_order_id as string, o.id as string);
  }

  const rows = stripeRefundRows(refunds, siteId, orderIdByCharge);
  await upsertRefunds(supabase, rows);

  const voided = voidStripeRefundIds(refunds);
  if (voided.length)
    await supabase.from("refunds").delete().eq("site_id", siteId).eq("source", "stripe").in("external_id", voided);
  return rows.length;
}

/** Daily safety net: refunds of the last `days` days for every Stripe site. */
export async function syncRecentStripeRefunds(
  supabase: SupabaseClient,
  site: { id: string; consumer_key: string | null },
  days = 7
): Promise<number> {
  if (!site.consumer_key) return 0;
  const since = Math.floor(Date.now() / 1000) - days * 86_400;
  return saveStripeRefunds(supabase, site.id, await fetchStripeRefunds(site.consumer_key, { since }));
}
