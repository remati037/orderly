import { SupabaseClient } from "@supabase/supabase-js";
import { toBase } from "@/lib/utils/fx";
import {
  fetchPaidOrders, fetchRefunds, summarizeRevenue,
  type RevenueOrder, type RevenueRefund, type RevenueSummary,
} from "@/lib/metrics";

export interface CountedOrder extends RevenueOrder {
  created_at: string;
}

export interface CountedRefund extends RevenueRefund {
  refunded_at: string;
}

export interface PeriodActivity {
  orders: CountedOrder[];
  refunds: CountedRefund[];
  error: unknown;
}

// Paid orders created in [start, end) and refunds made in it, optionally for
// one site / some products. Shared by the TV board and the menu bar endpoint so both count
// revenue the same way as the KPIs (net = gross − refunds, see lib/metrics).
export async function fetchPeriodActivity(
  supabase: SupabaseClient,
  start: string,
  end: string,
  siteId?: string | null,
  products?: string[] | null
): Promise<PeriodActivity> {
  const q = { start, end, siteId, products };
  const [orders, refunds] = await Promise.all([
    fetchPaidOrders<CountedOrder>(supabase, q, "created_at"),
    fetchRefunds<CountedRefund>(supabase, q, "refunded_at"),
  ]);
  return { orders: orders.data, refunds: refunds.data, error: orders.error ?? refunds.error };
}

export interface ActivitySummary extends RevenueSummary {
  /** Net revenue per bucket: orders at their creation, refunds when made. */
  buckets: number[];
  /** Paid orders per bucket. */
  orderBuckets: number[];
  lastOrderAt: string | null;
}

/** Net revenue summary plus a per-bucket split (e.g. by local hour). */
export function summarizeActivity(
  a: Pick<PeriodActivity, "orders" | "refunds">,
  rates: Record<string, number>,
  bucketCount: number,
  bucketOf: (iso: string) => number
): ActivitySummary {
  const buckets = Array<number>(bucketCount).fill(0);
  const orderBuckets = Array<number>(bucketCount).fill(0);
  let lastOrderAt: string | null = null;
  for (const o of a.orders) {
    const b = bucketOf(o.created_at);
    if (b >= 0 && b < bucketCount) {
      buckets[b] += toBase(Number(o.total ?? 0), o.currency ?? "RSD", rates);
      orderBuckets[b]++;
    }
    if (!lastOrderAt || o.created_at > lastOrderAt) lastOrderAt = o.created_at;
  }
  for (const r of a.refunds) {
    const b = bucketOf(r.refunded_at);
    if (b >= 0 && b < bucketCount) buckets[b] -= toBase(Number(r.amount), r.currency, rates);
  }
  return { ...summarizeRevenue(a.orders, a.refunds, rates), buckets, orderBuckets, lastOrderAt };
}
