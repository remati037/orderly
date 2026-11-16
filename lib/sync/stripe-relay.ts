// Stripe webhook relay with a product filter.
//
// A Stripe webhook endpoint receives every event of the account. Some external
// handlers (e.g. the 100 knjiga delivery on 100knjiga.biznisprice.com) treat
// every `checkout.session.completed` as their own sale. Pointing that Stripe
// destination at this relay lets only the right products through: the raw body
// and the original Stripe-Signature header are forwarded unchanged, so the
// target still verifies the signature with its own secret.
//
// Config lives in settings.stripe_relays:
//   { "<relayId>": { "target": "https://…", "site_id": "<stripe site with a key
//     that can read Checkout Sessions on that account>", "products": ["prod_…"] } }

export interface StripeRelayConfig {
  target: string;
  site_id: string;
  products: string[];
}

export function parseRelayConfig(value: unknown, relayId: string): StripeRelayConfig | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (value as any)?.[relayId];
  if (!c || typeof c.target !== "string" || !/^https:\/\//.test(c.target)) return null;
  if (typeof c.site_id !== "string" || !Array.isArray(c.products) || !c.products.length) return null;
  return { target: c.target, site_id: c.site_id, products: c.products.map(String) };
}

// Only Checkout Session events carry a product we can check; everything else
// the target subscribed to passes through untouched.
export function needsProductCheck(eventType: string): boolean {
  return eventType.startsWith("checkout.session.");
}
