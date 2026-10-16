// Refunds from WooCommerce and Stripe, mapped to `refunds` rows.
//
// Pure functions plus thin API fetchers, with no "@/" imports, so the backfill
// script (scripts/backfill-refunds.mts, run by plain node) shares this exact code
// with the webhooks and the cron.

export interface RefundRow {
  order_id: string;
  site_id: string;
  source: "woocommerce" | "stripe";
  external_id: string;
  amount: number;
  currency: string;
  reason: string | null;
  refunded_at: string;
}

// ── WooCommerce ────────────────────────────────────────────────────────────────

// What the order payload itself carries: id, reason, and a negative total.
export interface WooOrderRefundRef {
  id: number;
  reason?: string | null;
  total: string;
}

// GET /orders/{id}/refunds — adds the date the order payload lacks.
export interface WooRefund {
  id: number;
  date_created?: string | null;
  date_created_gmt?: string | null;
  amount: string;
  reason?: string | null;
}

const toUtc = (gmt?: string | null) =>
  gmt ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(gmt) ? gmt : `${gmt}Z`).toISOString() : null;

const money = (v: string | number | null | undefined) =>
  Math.round(Math.abs(Number(v ?? 0)) * 100) / 100;

/**
 * Refund rows for one Woo order. `details` (from the refunds endpoint) supply the
 * real refund date; without them the order's last modification is the best
 * available guess — that's when Woo recorded the refund on the order.
 */
export function wooRefundRows(
  order: {
    refunds?: WooOrderRefundRef[] | null;
    currency?: string | null;
    date_modified_gmt?: string | null;
  },
  ids: { orderId: string; siteId: string },
  details: WooRefund[] = []
): RefundRow[] {
  const byId = new Map(details.map((d) => [d.id, d]));
  const fallbackDate = toUtc(order.date_modified_gmt) ?? new Date().toISOString();
  return (order.refunds ?? []).map((r) => {
    const d = byId.get(r.id);
    return {
      order_id: ids.orderId,
      site_id: ids.siteId,
      source: "woocommerce",
      external_id: String(r.id),
      amount: money(d?.amount ?? r.total),
      currency: order.currency || "RSD",
      reason: (d?.reason ?? r.reason) || null,
      refunded_at: toUtc(d?.date_created_gmt) ?? fallbackDate,
    };
  });
}

/** Refund ids on the order that we don't have stored yet. */
export function unknownRefundIds(order: { refunds?: WooOrderRefundRef[] | null }, known: Iterable<string>): number[] {
  const have = new Set(known);
  return (order.refunds ?? []).map((r) => r.id).filter((id) => !have.has(String(id)));
}

export async function fetchWooRefunds(
  site: { url: string; consumer_key: string; consumer_secret: string },
  wooOrderId: string | number
): Promise<WooRefund[]> {
  const auth = Buffer.from(`${site.consumer_key}:${site.consumer_secret}`).toString("base64");
  const res = await fetch(`${site.url.replace(/\/$/, "")}/wp-json/wc/v3/orders/${wooOrderId}/refunds?per_page=100`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Woo refunds HTTP ${res.status}`);
  return (await res.json()) as WooRefund[];
}

// ── Stripe ─────────────────────────────────────────────────────────────────────

export interface StripeRefund {
  id: string;
  amount: number;
  currency: string;
  charge: string | null;
  created: number;
  reason?: string | null;
  status?: string | null; // succeeded | pending | failed | canceled | requires_action
}

const ZERO_DECIMAL = new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"]);
const stripeMoney = (amount: number, currency: string) =>
  ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;

/**
 * Refund rows for refunds whose charge we have as an order (`orderIdByCharge`).
 * Failed / canceled refunds returned nothing to the customer and are skipped.
 */
export function stripeRefundRows(
  refunds: StripeRefund[],
  siteId: string,
  orderIdByCharge: Map<string, string>
): RefundRow[] {
  const rows: RefundRow[] = [];
  for (const r of refunds) {
    const orderId = r.charge ? orderIdByCharge.get(r.charge) : undefined;
    if (!orderId) continue;
    if (r.status === "failed" || r.status === "canceled") continue;
    const currency = r.currency.toUpperCase();
    rows.push({
      order_id: orderId,
      site_id: siteId,
      source: "stripe",
      external_id: r.id,
      amount: stripeMoney(r.amount, currency),
      currency,
      reason: r.reason ?? null,
      refunded_at: new Date(r.created * 1000).toISOString(),
    });
  }
  return rows;
}

/** Stripe refund ids that ended up failed / canceled — stored rows for them must go. */
export function voidStripeRefundIds(refunds: StripeRefund[]): string[] {
  return refunds.filter((r) => r.status === "failed" || r.status === "canceled").map((r) => r.id);
}

/** All refunds created at or after `since` (unix seconds), or for one charge. */
export async function fetchStripeRefunds(
  secretKey: string,
  opts: { since?: number; charge?: string }
): Promise<StripeRefund[]> {
  const out: StripeRefund[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 500; page++) {
    const url = new URL("https://api.stripe.com/v1/refunds");
    url.searchParams.set("limit", "100");
    if (opts.since) url.searchParams.set("created[gte]", String(opts.since));
    if (opts.charge) url.searchParams.set("charge", opts.charge);
    if (cursor) url.searchParams.set("starting_after", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Stripe refunds HTTP ${res.status}`);
    const body = (await res.json()) as { data: StripeRefund[]; has_more: boolean };
    out.push(...body.data);
    if (!body.has_more || !body.data.length) break;
    cursor = body.data[body.data.length - 1].id;
  }
  return out;
}

/** A charge counts as fully refunded once nothing of it is left. */
export function isFullyRefunded(charge: { amount?: number; amount_refunded?: number; refunded?: boolean }): boolean {
  if (charge.refunded) return true;
  return (charge.amount ?? 0) > 0 && (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);
}
