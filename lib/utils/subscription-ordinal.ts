import type { adminClient } from "@/lib/supabase/admin";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { fetchAll } from "@/lib/supabase/fetch-all";

type Supa = ReturnType<typeof adminClient>;

// `orders.payment_type` / `orders.product_type` are never actually set to
// "subscription" by the sync jobs (always "one-time" / "digital" in practice),
// so the only reliable signal for "is this product a subscription" is the
// product_name list already on the subscriptions table. Cached in-memory since
// it changes rarely and every caller would otherwise re-query it per request.
let cachedNames: Set<string> | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

async function getSubscriptionProductNames(supabase: Supa): Promise<Set<string>> {
  if (cachedNames && Date.now() - cachedAt < CACHE_MS) return cachedNames;
  const { data } = await supabase.from("subscriptions").select("product_name");
  cachedNames = new Set((data ?? []).map((r) => r.product_name).filter(Boolean) as string[]);
  cachedAt = Date.now();
  return cachedNames;
}

export interface OrdinalInput {
  id: string;
  customer_email: string | null;
  product_name: string | null;
  created_at: string;
}

// Batch: for each order that's a subscription product, work out which renewal
// number it is (2nd, 3rd, …) — how many of the customer's *successful* orders
// for the same product happened before this one, +1. Deliberately counts
// against successful history even when the input order itself failed (a
// Naplata card for a declined 3rd renewal should still read "3", not be
// skipped just because this particular attempt didn't go through).
// orders.customer_id is never populated by the sync jobs, so this is keyed on
// customer_email instead — same approach as the Naplata "resolved elsewhere" check.
//
// Returns a Map<orderId, seq> — the FIRST payment (seq 1) and non-subscription
// products are simply absent from the map, since there's nothing to show for
// them ("no badge" already means "first time").
export async function computeSubscriptionOrdinals(
  supabase: Supa,
  orders: OrdinalInput[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const subNames = await getSubscriptionProductNames(supabase);
  if (!subNames.size) return result;

  const relevant = orders.filter(
    (o) => o.customer_email && o.product_name && subNames.has(o.product_name)
  );
  if (!relevant.length) return result;

  const emails = Array.from(new Set(relevant.map((o) => (o.customer_email as string).toLowerCase())));

  // Bounded by product_name (via the order_items join), not by email — emails
  // aren't normalized to lowercase in the DB, so filtering by an exact .in()
  // list would silently miss same-customer orders stored with different casing.
  // Matching case-insensitively in JS below avoids that trap.
  const { data } = await fetchAll<Row>(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("orders")
      .select("id, customer_email, created_at, order_items!inner(product_name)")
      .in("status", COUNTED_STATUSES)
      .not("customer_email", "is", null)
      .in("order_items.product_name", Array.from(subNames))
      .order("id")
  );

  type Row = { customer_email: string; created_at: string; order_items: { product_name: string }[] | null };

  // Timestamps of successful payments per (email, product) — the count basis.
  const successTimes = new Map<string, number[]>();
  for (const row of data) {
    const email = row.customer_email?.toLowerCase();
    if (!email || !emails.includes(email)) continue;
    const productName = row.order_items?.[0]?.product_name;
    if (!productName || !subNames.has(productName)) continue;

    const key = `${email}|${productName}`;
    const list = successTimes.get(key) ?? [];
    list.push(new Date(row.created_at).getTime());
    successTimes.set(key, list);
  }

  for (const o of relevant) {
    const key = `${(o.customer_email as string).toLowerCase()}|${o.product_name}`;
    const times = successTimes.get(key);
    if (!times) continue;
    const thisTime = new Date(o.created_at).getTime();
    const seq = times.filter((t) => t < thisTime).length + 1;
    if (seq > 1) result.set(o.id, seq);
  }

  return result;
}
