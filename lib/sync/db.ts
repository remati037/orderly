import { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedWooOrder } from "./normalize-woo-order";

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

export async function upsertCustomer(
  supabase: SupabaseClient,
  email: string,
  name: string,
  total: number,
  city?: string
) {
  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, order_count, total_spent, first_order_at")
    .eq("email", email)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    await supabase
      .from("customers")
      .update({
        name: name || existing.name,
        ...(city !== undefined && { city }),
        order_count: (existing.order_count ?? 0) + 1,
        total_spent: (existing.total_spent ?? 0) + total,
        last_order_at: now,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("customers").insert({
      email,
      name,
      ...(city !== undefined && { city }),
      total_spent: total,
      order_count: 1,
      first_order_at: now,
      last_order_at: now,
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
