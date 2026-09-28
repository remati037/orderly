import { describe, expect, it } from "vitest";
import { mapStripeStatus, normalizeStripeEvent, stripeAmount } from "./normalize-stripe-event";

describe("stripeAmount", () => {
  it("divides normal currencies by 100 and leaves zero-decimal ones", () => {
    expect(stripeAmount(4900, "eur")).toBe(49);
    expect(stripeAmount(500, "JPY")).toBe(500);
  });
});

describe("mapStripeStatus", () => {
  it("keys only on charge / checkout events (no invoice duplicates)", () => {
    expect(mapStripeStatus("charge.succeeded")).toBe("completed");
    expect(mapStripeStatus("charge.failed")).toBe("failed");
    expect(mapStripeStatus("checkout.session.expired")).toBe("checkout-draft");
    expect(mapStripeStatus("invoice.paid")).toBeNull();
    expect(mapStripeStatus("payment_intent.succeeded")).toBeNull();
  });
});

describe("normalizeStripeEvent", () => {
  const charge = {
    id: "ch_1",
    amount: 10000,
    currency: "eur",
    created: 1_790_000_000,
    invoice: "in_1",
    billing_details: { name: "Ana Anić", email: "ana@example.com", address: { city: "Beograd" } },
  };

  it("maps a successful subscription charge to an order row", () => {
    const row = normalizeStripeEvent({ type: "charge.succeeded", data: { object: charge } }, "site-1", 100, 1.75)!;
    expect(row).toMatchObject({
      site_id: "site-1",
      woo_order_id: "ch_1",
      source: "stripe",
      status: "completed",
      total: 100,
      currency: "EUR",
      customer_email: "ana@example.com",
      customer_city: "Beograd",
      product_type: "subscription",
      payment_type: "subscription",
      processor_fee: 1.75,
      net_profit: 98.25,
      created_at: new Date(1_790_000_000 * 1000).toISOString(),
    });
  });

  it("falls back to a 5% fee estimate and applies the margin", () => {
    const row = normalizeStripeEvent({ type: "charge.succeeded", data: { object: { ...charge, invoice: null } } }, "s", 50, null)!;
    expect(row.net_profit).toBe(47.5); // (100 - 5) * 50%
    expect(row.product_type).toBe("digital");
  });

  it("ignores events we don't track", () => {
    expect(normalizeStripeEvent({ type: "invoice.paid", data: { object: charge } }, "s", 100, null)).toBeNull();
  });
});
