// Support Hub customer card: turns the rows from support_customer_lookup
// (migration 037) into the response of GET /api/support/customer.
// The contract lives in Support Hub (packages/core/src/orderly/contract.ts);
// the test in test/db/support-api.test.ts holds a copy of its Zod schema.

import { toBase } from "@/lib/utils/fx";
import { isPaidStatus, ruleTargets, type CircleConfig } from "@/lib/circle/access";

export type SupportOrderStatus =
  | "paid" | "pending" | "on_hold" | "refunded" | "partially_refunded" | "cancelled" | "failed";
export type SupportSubscriptionStatus = "active" | "paused" | "cancelled" | "past_due" | "expired";
export type SupportCircleStatus = "granted" | "pending" | "failed" | "revoked";

export interface LookupOrder {
  id: string;
  site_id: string;
  site_name: string;
  source: string;
  status: string;
  woo_order_id: string | null;
  total: number | string | null;
  refunded_total: number | string | null;
  currency: string | null;
  created_at: string;
  paid_at: string | null;
  line_items: { product_id: number; name: string | null }[];
  products: { name: string | null; quantity: number | null }[];
}

export interface LookupSubscription {
  id: string;
  site_id: string;
  product_name: string | null;
  status: string | null;
  mrr: number | string | null;
  mrr_amount: number | string | null;
  mrr_currency: string | null;
  next_billing_at: string | null;
  cancelled_at: string | null;
}

export interface LookupGrant {
  order_id: string;
  access_group_id: number;
  status: string;
  last_error: string | null;
  granted_at: string | null;
}

export interface LookupResult {
  customer: { id: string; email: string; name: string | null } | null;
  orders: LookupOrder[];
  subscriptions: LookupSubscription[];
  circle_grants: LookupGrant[];
  open_recovery: boolean;
}

export interface BuildOptions {
  origin: string;             // absolute Orderly URL, e.g. https://orderly-drab.vercel.app
  baseCurrency: string;
  rates: Record<string, number>;
  circle: CircleConfig;
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const currency = (c: string | null | undefined, fallback: string) => {
  const v = (c ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : fallback;
};

/** Orderly order status → contract status. Refund amounts decide paid vs. (partially) refunded. */
export function mapOrderStatus(status: string, total: number, refunded: number): SupportOrderStatus {
  switch (status) {
    case "completed":
    case "processing":
    case "refunded":
      if (status === "refunded" || (refunded > 0 && refunded >= total)) {
        return refunded > 0 && refunded < total ? "partially_refunded" : "refunded";
      }
      return refunded > 0 ? "partially_refunded" : "paid";
    case "on-hold":
      return "on_hold";
    case "cancelled":
    case "trash":
      return "cancelled";
    case "failed":
      return "failed";
    // pending, checkout-draft (abandoned Stripe checkout), funnel drafts and
    // anything unknown: not paid, still open.
    default:
      return "pending";
  }
}

/** Amount refunded on an order. A "refunded" order with no refund rows yet counts as fully refunded. */
function refundedAmount(status: string, total: number, refundedTotal: number): number {
  if (status === "refunded" && refundedTotal <= 0) return total;
  return Math.min(refundedTotal, total);
}

export function mapSubscriptionStatus(status: string | null): SupportSubscriptionStatus {
  switch (status) {
    case "paused":    return "paused";
    case "cancelled": return "cancelled";
    case "past_due":  return "past_due";
    case "expired":   return "expired";
    default:          return "active"; // active, trial
  }
}

const PAID_LIKE = new Set<SupportOrderStatus>(["paid", "partially_refunded", "refunded"]);

export function orderUrl(origin: string, o: Pick<LookupOrder, "id" | "site_id" | "woo_order_id">) {
  const q = o.woo_order_id ?? o.id;
  return `${origin}/porudzbine?q=${encodeURIComponent(q)}&sites=${encodeURIComponent(o.site_id)}`;
}

export function buildCustomerResponse(raw: LookupResult, opts: BuildOptions) {
  const empty = {
    found: false,
    customer: null,
    orders: [],
    subscriptions: [],
    circle_access: [],
    open_payment_recovery: false,
  };
  const c = raw.customer;
  if (!c || (raw.orders.length === 0 && raw.subscriptions.length === 0)) return empty;

  const orders = raw.orders.map((o) => {
    const total = num(o.total);
    const refunded = refundedAmount(o.status, total, num(o.refunded_total));
    const status = mapOrderStatus(o.status, total, refunded);
    return {
      raw: o,
      out: {
        id: o.id,
        site_id: o.site_id,
        site_name: o.site_name ?? "",
        number: o.woo_order_id ?? o.id,
        status,
        platform: o.source,
        total: round2(total),
        currency: currency(o.currency, "RSD"),
        refunded_amount: round2(refunded),
        created_at: o.created_at,
        paid_at: PAID_LIKE.has(status) ? o.paid_at : null,
        products: (o.products ?? []).map((p) => ({
          name: p.name ?? "",
          quantity: Math.max(0, Math.trunc(num(p.quantity))),
        })),
        orderly_url: orderUrl(opts.origin, o),
      },
    };
  });

  // LTV: only paid orders (paid / partially refunded / refunded, with a paid
  // date), net of refunds, in the base currency. pending, on_hold, cancelled
  // and failed never count.
  const paid = orders.filter((o) => PAID_LIKE.has(o.out.status) && o.out.paid_at);
  const totalSpent = paid.reduce(
    (sum, o) => sum + toBase(o.out.total - o.out.refunded_amount, o.out.currency, opts.rates),
    0
  );
  // Count and first order like customers.order_count in Orderly: paid orders
  // the customer kept (a fully refunded one doesn't count as a purchase).
  const kept = paid.filter((o) => o.out.status !== "refunded");
  const firstOrderAt = kept.reduce<string | null>(
    (first, o) => (!first || o.out.created_at < first ? o.out.created_at : first),
    null
  );

  return {
    found: true,
    customer: {
      name: c.name,
      email: c.email,
      first_order_at: firstOrderAt,
      orders_count: kept.length,
      total_spent: round2(totalSpent),
      base_currency: currency(opts.baseCurrency, "EUR"),
      orderly_url: `${opts.origin}/customers/${encodeURIComponent(c.id)}`,
    },
    orders: orders.slice(0, 10).map((o) => o.out),
    subscriptions: raw.subscriptions.map((s) => ({
      id: s.id,
      site_id: s.site_id,
      product: s.product_name ?? "",
      status: mapSubscriptionStatus(s.status),
      amount: round2(num(s.mrr_amount ?? s.mrr)),
      currency: currency(s.mrr_amount != null ? s.mrr_currency : null, currency(opts.baseCurrency, "EUR")),
      next_payment_at: s.status === "cancelled" ? null : s.next_billing_at,
      cancelled_at: s.cancelled_at,
    })),
    circle_access: circleAccess(raw, opts.circle),
    open_payment_recovery: raw.open_recovery,
  };
}

// Circle grants per (order, access group), from the same data lib/circle/access.ts
// writes: circle_grants rows (ok → granted, error → failed with the error text),
// plus paid orders the rules entitle to a group that the sweep hasn't granted yet
// (pending).
function circleAccess(raw: LookupResult, cfg: CircleConfig) {
  const ordersById = new Map(raw.orders.map((o) => [o.id, o]));
  const ruleFor = (siteId: string, groupId: number, productIds: Set<number>) =>
    cfg.rules.find(
      (r) =>
        ruleTargets(r).includes(groupId) &&
        (!r.site_id || r.site_id === siteId) &&
        productIds.has(Number(r.woo_product_id))
    );
  const describe = (o: LookupOrder | undefined, groupId: number) => {
    const items = o?.line_items ?? [];
    const rule = o ? ruleFor(o.site_id, groupId, new Set(items.map((i) => Number(i.product_id)))) : undefined;
    const item = rule ? items.find((i) => Number(i.product_id) === Number(rule.woo_product_id)) : undefined;
    const named = rule as { access_group_name?: unknown } | undefined;
    return {
      product: item?.name ?? o?.products?.[0]?.name ?? "",
      group_name: typeof named?.access_group_name === "string" ? named.access_group_name : `Circle grupa ${groupId}`,
    };
  };

  const out: { product: string; group_name: string; status: SupportCircleStatus; granted_at: string | null; error: string | null }[] = [];
  const seen = new Set<string>();
  for (const g of raw.circle_grants) {
    const groupId = Number(g.access_group_id);
    seen.add(`${g.order_id}|${groupId}`);
    const ok = g.status === "ok";
    out.push({
      ...describe(ordersById.get(g.order_id), groupId),
      status: ok ? "granted" : "failed",
      granted_at: ok ? g.granted_at : null,
      error: ok ? null : g.last_error ?? "Dodela nije uspela",
    });
  }

  if (cfg.enabled) {
    for (const o of raw.orders) {
      if (o.source !== "woocommerce" || !isPaidStatus(o.status)) continue;
      if (cfg.enabled_from && Date.parse(o.created_at) < Date.parse(cfg.enabled_from)) continue;
      const productIds = new Set((o.line_items ?? []).map((i) => Number(i.product_id)));
      for (const r of cfg.rules) {
        if (r.site_id && r.site_id !== o.site_id) continue;
        if (!productIds.has(Number(r.woo_product_id))) continue;
        for (const t of ruleTargets(r)) {
          const key = `${o.id}|${t}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ ...describe(o, t), status: "pending", granted_at: null, error: null });
        }
      }
    }
  }
  return out;
}
