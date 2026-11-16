// Product-level filtering for Stripe sites.
//
// A charge does not say which product it paid for. When one Stripe account
// sells several things (and only some of them belong to an Orderly site), we
// look the product up: a subscription/installment charge through its invoice
// lines, a one-time Checkout / Payment Link charge through its Checkout
// Session line items. Anything else (e.g. WooCommerce charges on the same
// account) has no line items and is therefore not this site's.
//
// Filter syntax in sites.stripe_filter:
//   "product:prod_A"            → only charges for that product
//   "product:prod_A,prod_B"     → any of these products
//   "price:price_X,price_Y"     → only these prices
// (The metadata syntax "key" / "!key" is handled by matchesStripeFilter.)

export interface StripeLineItem {
  product: string | null;
  price: string | null;
  description: string | null;
  recurring: boolean;
}

export interface ProductFilter {
  kind: "product" | "price";
  ids: Set<string>;
}

export function parseProductFilter(filter: string | null | undefined): ProductFilter | null {
  const f = (filter ?? "").trim();
  const m = /^(product|price)\s*:\s*(.+)$/i.exec(f);
  if (!m) return null;
  const ids = m[2]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return null;
  return { kind: m[1].toLowerCase() as "product" | "price", ids: new Set(ids) };
}

// Lines of a charge that belong to the filter (empty = not this site's charge).
export function matchingLines(items: StripeLineItem[], filter: ProductFilter): StripeLineItem[] {
  return items.filter((li) => {
    const id = filter.kind === "product" ? li.product : li.price;
    return id != null && filter.ids.has(id);
  });
}

// Pinned so `charge.invoice` is still present (newer API versions dropped it).
const STRIPE_VERSION = "2024-06-20";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLine(li: any): StripeLineItem {
  const price = li?.price ?? null;
  const product = typeof price?.product === "string" ? price.product : price?.product?.id ?? null;
  return {
    product,
    price: typeof price === "string" ? price : price?.id ?? null,
    // Prefer the clean product name (invoice line descriptions read "1 × X (at €…)").
    description: (typeof price?.product === "object" ? price.product?.name : null) ?? li?.description ?? null,
    recurring: !!price?.recurring,
  };
}

// Line items behind a charge or a Checkout Session. Throws on Stripe/HTTP
// errors so the webhook can answer 500 and let Stripe retry.
export async function fetchStripeLineItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  secretKey: string
): Promise<{ items: StripeLineItem[]; viaInvoice: boolean }> {
  async function get(path: string) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${secretKey}`, "Stripe-Version": STRIPE_VERSION },
    });
    if (!res.ok) throw new Error(`Stripe ${res.status} on ${path.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  if (!obj?.id) return { items: [], viaInvoice: false };

  if (obj.object === "checkout.session") {
    const li = await get(`checkout/sessions/${obj.id}/line_items?limit=100`);
    return { items: (li.data ?? []).map(toLine), viaInvoice: false };
  }

  // Charge: re-read it on the pinned version to get invoice + payment_intent.
  const charge = obj.object === "charge" && "invoice" in obj ? obj : await get(`charges/${obj.id}`);
  const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;

  if (invoiceId) {
    const lines = await get(`invoices/${invoiceId}/lines?limit=100&expand[]=data.price.product`);
    return { items: (lines.data ?? []).map(toLine), viaInvoice: true };
  }

  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (pi) {
    const sessions = await get(
      `checkout/sessions?payment_intent=${encodeURIComponent(pi)}&expand[]=data.line_items`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (sessions.data ?? []).flatMap((s: any) => s.line_items?.data ?? []).map(toLine);
    return { items, viaInvoice: false };
  }

  return { items: [], viaInvoice: false };
}
