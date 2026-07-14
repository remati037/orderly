// Maps a Stripe webhook event to an Orderly order row.
//
// We key on charge-level and invoice/checkout events because they fire for both
// one-time payments and subscription renewals (Circle sells both). Statuses map
// straight onto the recovery pipeline: failed / expired become tasks, succeeded
// closes them and enters revenue.

export interface StripeOrderRow {
  site_id: string;
  woo_order_id: string; // Stripe object id — unique per site (UNIQUE(site_id, woo_order_id))
  source: "stripe";
  status: string;
  total: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  customer_phone: string | null;
  product_type: "digital" | "subscription";
  payment_type: string;
  processor_fee: number | null;
  net_profit: number;
  woo_data: unknown;
  created_at: string;
}

interface Billing {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: { city?: string | null } | null;
}

// Stripe amounts are in the currency's smallest unit. Zero-decimal currencies
// (JPY, HUF, …) are not divided; everything else is /100.
const ZERO_DECIMAL = new Set(["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"]);

export function stripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}

// event.type → our order status. Returns null for events we ignore.
export function mapStripeStatus(eventType: string): string | null {
  switch (eventType) {
    case "charge.succeeded":
    case "invoice.paid":
      return "completed";
    case "charge.failed":
    case "payment_intent.payment_failed":
    case "invoice.payment_failed":
      return "failed";
    case "checkout.session.expired":
      return "checkout-draft";
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStripeEvent(
  event: any,
  siteId: string,
  marginPercent: number,
  processorFee: number | null
): StripeOrderRow | null {
  const status = mapStripeStatus(event.type);
  if (!status) return null;

  const obj = event.data?.object;
  if (!obj) return null;

  const currency = String(obj.currency ?? "usd").toUpperCase();

  // Amount + billing differ slightly by object type.
  const rawAmount =
    obj.amount ?? obj.amount_total ?? obj.amount_paid ?? obj.amount_due ?? 0;
  const total = stripeAmount(Number(rawAmount), currency);

  const billing: Billing =
    obj.billing_details ??
    obj.customer_details ??
    { name: obj.customer_name, email: obj.customer_email };

  const isSubscription = event.type.startsWith("invoice.") || !!obj.subscription;

  // Real fee reduces profit; fall back to the flat 5% card estimate.
  const feeForProfit = processorFee ?? total * 0.05;
  const netProfit = (total - feeForProfit) * (marginPercent / 100);

  const createdSec = obj.created ?? event.created;
  const createdAt = createdSec
    ? new Date(createdSec * 1000).toISOString()
    : new Date().toISOString();

  return {
    site_id: siteId,
    woo_order_id: String(obj.id),
    source: "stripe",
    status,
    total,
    currency,
    customer_name: billing.name ?? null,
    customer_email: billing.email ?? obj.receipt_email ?? null,
    customer_city: billing.address?.city ?? null,
    customer_phone: billing.phone ?? null,
    product_type: isSubscription ? "subscription" : "digital",
    payment_type: isSubscription ? "subscription" : "one-time",
    processor_fee: processorFee,
    net_profit: Math.round(netProfit * 100) / 100,
    woo_data: obj,
    created_at: createdAt,
  };
}

// Best-effort product label for the order line.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripeProductName(obj: any, siteName: string): string {
  return (
    obj?.lines?.data?.[0]?.description ||
    obj?.description ||
    obj?.lines?.data?.[0]?.price?.nickname ||
    siteName
  );
}
