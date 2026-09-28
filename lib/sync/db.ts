import { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedWooOrder } from "./normalize-woo-order";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { loadFxSettings, toBase, type FxSettings } from "@/lib/utils/fx";

export async function upsertWooOrder(
  supabase: SupabaseClient,
  normalized: NormalizedWooOrder
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("orders")
    .upsert(normalized.orderRow, { onConflict: "site_id,woo_order_id" })
    .select("id")
    .single();

  if (error || !row) return null;

  await supabase.from("order_items").delete().eq("order_id", row.id);

  if (normalized.itemRows.length > 0) {
    await supabase
      .from("order_items")
      .insert(normalized.itemRows.map((item) => ({ ...item, order_id: row.id })));
  }

  return row.id as string;
}

// FX settings change rarely; cache them so a sync of hundreds of orders
// doesn't re-read settings for every customer.
let fxCache: { at: number; value: Promise<FxSettings> } | null = null;
function cachedFx(supabase: SupabaseClient): Promise<FxSettings> {
  if (!fxCache || Date.now() - fxCache.at > 5 * 60_000) {
    fxCache = { at: Date.now(), value: loadFxSettings(supabase) };
  }
  return fxCache.value;
}

// Recomputes the customer's totals from their orders instead of incrementing,
// so webhook redeliveries and re-syncs of the same order never double-count.
// total_spent is stored in the base currency (orders come in EUR/RSD/USD).
// Call it after the order itself has been upserted.
export async function upsertCustomer(
  supabase: SupabaseClient,
  email: string,
  name: string,
  city?: string
) {
  const [fx, { data: existing }, { data: orders }] = await Promise.all([
    cachedFx(supabase),
    supabase
      .from("customers")
      .select("id, name, first_order_at, last_order_at")
      .eq("email", email)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("total, currency, created_at")
      .eq("customer_email", email)
      .in("status", COUNTED_STATUSES),
  ]);

  const counted = orders ?? [];
  const totalSpent =
    Math.round(counted.reduce((sum, o) => sum + toBase(Number(o.total ?? 0), o.currency ?? "RSD", fx.rates), 0) * 100) / 100;
  const dates = counted.map((o) => o.created_at as string).sort();
  const now = new Date().toISOString();

  const totals = {
    order_count: counted.length,
    total_spent: totalSpent,
    first_order_at: dates[0] ?? existing?.first_order_at ?? now,
    last_order_at: dates[dates.length - 1] ?? existing?.last_order_at ?? now,
  };

  if (existing) {
    await supabase
      .from("customers")
      .update({
        name: name || existing.name,
        ...(city !== undefined && { city }),
        ...totals,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("customers").insert({
      email,
      name,
      ...(city !== undefined && { city }),
      ...totals,
    });
  }
}

// Thinkific has no subscription id we can key on, so one row per
// (site, customer, product) — renewals and re-syncs update it instead of
// inserting another "active" row.
export async function upsertThinkificSubscription(
  supabase: SupabaseClient,
  siteId: string,
  email: string,
  productName: string,
  mrr: number,
  startedAt: string
) {
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  const customerId = customer?.id ?? null;

  let query = supabase
    .from("subscriptions")
    .select("id, started_at")
    .eq("site_id", siteId)
    .eq("product_name", productName)
    .is("stripe_subscription_id", null)
    .order("started_at", { ascending: true })
    .limit(1);
  query = customerId ? query.eq("customer_id", customerId) : query.is("customer_id", null);
  const { data: existing } = await query.maybeSingle();

  if (existing) {
    const earliest =
      existing.started_at && existing.started_at < startedAt ? existing.started_at : startedAt;
    await supabase
      .from("subscriptions")
      .update({ mrr, status: "active", started_at: earliest })
      .eq("id", existing.id);
  } else {
    await supabase.from("subscriptions").insert({
      site_id: siteId,
      customer_id: customerId,
      product_name: productName,
      mrr,
      status: "active",
      started_at: startedAt,
    });
  }
}

export async function logSync(
  supabase: SupabaseClient,
  siteId: string,
  type: "webhook" | "manual" | "cron",
  status: "success" | "error" | "partial",
  ordersSynced: number,
  errorMsg?: string
) {
  await supabase.from("sync_log").insert({
    site_id: siteId,
    type,
    status,
    orders_synced: ordersSynced,
    error_msg: errorMsg ?? null,
  });
}
