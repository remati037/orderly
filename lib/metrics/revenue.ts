import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { toBase } from "@/lib/utils/fx";
import { PAID_STATUSES } from "./definitions";

export interface RevenueOrder {
  total: number | null;
  currency: string | null;
  net_profit: number | null;
  payment_method: string | null;
  processor_fee: number | null;
}

export interface RevenueRefund {
  amount: number;
  currency: string;
  // The refunded order, for the profit share of the refund.
  order: { total: number | null; net_profit: number | null } | null;
}

export interface RevenueSummary {
  gross: number;
  refunds: number;
  refundCount: number;
  net: number;
  orders: number;
  aov: number;
  netProfit: number;
  fees: number;
}

export const EMPTY_REVENUE: RevenueSummary = {
  gross: 0, refunds: 0, refundCount: 0, net: 0, orders: 0, aov: 0, netProfit: 0, fees: 0,
};

/** Processor fee of one order: the real Stripe fee, else 5% for card payments. */
export function orderFee(o: Pick<RevenueOrder, "total" | "payment_method" | "processor_fee">): number {
  if (o.processor_fee != null) return Number(o.processor_fee);
  return /stripe/i.test(o.payment_method ?? "") ? Number(o.total ?? 0) * 0.05 : 0;
}

/** Profit lost to a refund: the refunded share of the order's profit. */
export function refundProfit(r: RevenueRefund): number {
  const total = Number(r.order?.total ?? 0);
  return total > 0 ? (Number(r.amount) * Number(r.order?.net_profit ?? 0)) / total : 0;
}

/**
 * Net revenue for a period: paid orders created in it, minus refunds made in it.
 * `orders` and `refunds` must already be filtered to the period (and site /
 * products); everything is converted to the base currency with `rates`.
 */
export function summarizeRevenue(
  orders: RevenueOrder[],
  refunds: RevenueRefund[],
  rates: Record<string, number>
): RevenueSummary {
  let gross = 0, netProfit = 0, fees = 0, refundSum = 0;
  for (const o of orders) {
    const cur = o.currency ?? "RSD";
    gross += toBase(Number(o.total ?? 0), cur, rates);
    netProfit += toBase(Number(o.net_profit ?? 0), cur, rates);
    fees += toBase(orderFee(o), cur, rates);
  }
  for (const r of refunds) {
    refundSum += toBase(Number(r.amount), r.currency, rates);
    netProfit -= toBase(refundProfit(r), r.currency, rates);
  }
  const net = gross - refundSum;
  return {
    gross,
    refunds: refundSum,
    refundCount: refunds.length,
    net,
    orders: orders.length,
    aov: orders.length ? net / orders.length : 0,
    netProfit,
    fees,
  };
}

export interface RevenueQuery {
  start: string; // ISO, inclusive
  end: string;   // ISO, exclusive
  rates: Record<string, number>;
  siteId?: string | null;
  products?: string[] | null;
  orgId?: string | null;
}

const ORDER_COLUMNS = "total, currency, net_profit, payment_method, processor_fee";

/** Paid orders created in [start, end), optionally for one site / some products. */
export function fetchPaidOrders<T extends RevenueOrder = RevenueOrder>(
  supabase: SupabaseClient,
  q: Omit<RevenueQuery, "rates">,
  extraColumns = ""
) {
  const cols = extraColumns ? `${ORDER_COLUMNS}, ${extraColumns}` : ORDER_COLUMNS;
  return fetchAll<T>(() => {
    // Non-literal select strings defeat supabase-js typing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let b = (supabase as any)
      .from("orders")
      .select(q.products?.length ? `${cols}, order_items!inner(product_name)` : cols)
      .gte("created_at", q.start)
      .lt("created_at", q.end)
      .in("status", PAID_STATUSES)
      .order("id");
    if (q.products?.length) b = b.in("order_items.product_name", q.products);
    if (q.siteId) b = b.eq("site_id", q.siteId);
    if (q.orgId) b = b.eq("org_id", q.orgId);
    return b;
  });
}

/** Refunds made in [start, end), with their order's total and profit. */
export function fetchRefunds<T extends RevenueRefund = RevenueRefund>(
  supabase: SupabaseClient,
  q: Omit<RevenueQuery, "rates">,
  extraColumns = ""
) {
  const orderEmbed = q.products?.length
    ? "order:orders!inner(total, net_profit, order_items!inner(product_name))"
    : "order:orders!inner(total, net_profit)";
  const cols = `amount, currency, ${orderEmbed}${extraColumns ? `, ${extraColumns}` : ""}`;
  return fetchAll<T>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let b = (supabase as any)
      .from("refunds")
      .select(cols)
      .gte("refunded_at", q.start)
      .lt("refunded_at", q.end)
      .order("id");
    if (q.products?.length) b = b.in("order.order_items.product_name", q.products);
    if (q.siteId) b = b.eq("site_id", q.siteId);
    if (q.orgId) b = b.eq("org_id", q.orgId);
    return b;
  });
}

/** Revenue summary for one period, straight from orders + refunds. */
export async function fetchRevenue(supabase: SupabaseClient, q: RevenueQuery): Promise<RevenueSummary> {
  const [orders, refunds] = await Promise.all([fetchPaidOrders(supabase, q), fetchRefunds(supabase, q)]);
  if (orders.error || refunds.error) return EMPTY_REVENUE;
  return summarizeRevenue(orders.data, refunds.data, q.rates);
}

/**
 * summarizeRevenue split by a key (site, product, …): each order goes to
 * `orderKey(order)`, each refund to `refundKey(refund)`. A key that only has
 * refunds in the period still appears, with negative net.
 */
export function summarizeRevenueBy<K, O extends RevenueOrder, R extends RevenueRefund>(
  orders: O[],
  refunds: R[],
  rates: Record<string, number>,
  orderKey: (o: O) => K,
  refundKey: (r: R) => K
): Map<K, RevenueSummary> {
  const groups = new Map<K, { orders: O[]; refunds: R[] }>();
  const group = (k: K) => {
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { orders: [], refunds: [] }));
    return g;
  };
  for (const o of orders) group(orderKey(o)).orders.push(o);
  for (const r of refunds) group(refundKey(r)).refunds.push(r);
  return new Map([...groups].map(([k, g]) => [k, summarizeRevenue(g.orders, g.refunds, rates)]));
}

/** An order's own net: its total minus everything refunded on it so far. */
export function orderNet(o: { total: number | null; refunded_total?: number | null }): number {
  return Number(o.total ?? 0) - Number(o.refunded_total ?? 0);
}

/**
 * Share of an order that was kept (0…1): orderNet ÷ total. Scales line items
 * for per-product views; a fully refunded order keeps 0.
 */
export function orderKeptShare(o: { total: number | null; refunded_total?: number | null }): number {
  const total = Number(o.total ?? 0);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, orderNet(o) / total));
}
