import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStripeLineItems, matchingLines, parseProductFilter } from "./stripe-line-items";
import { matchesStripeFilter } from "./normalize-stripe-event";

describe("parseProductFilter", () => {
  it("reads product and price lists", () => {
    const f = parseProductFilter(" product: prod_A , prod_B ");
    expect(f?.kind).toBe("product");
    expect([...f!.ids]).toEqual(["prod_A", "prod_B"]);
    expect(parseProductFilter("price:price_X")?.kind).toBe("price");
  });
  it("ignores metadata filters and empty values", () => {
    expect(parseProductFilter("znak")).toBeNull();
    expect(parseProductFilter("!znak")).toBeNull();
    expect(parseProductFilter("product:")).toBeNull();
    expect(parseProductFilter(null)).toBeNull();
  });
  it("is not treated as a metadata key by matchesStripeFilter", () => {
    expect(matchesStripeFilter({ metadata: {} }, "product:prod_A")).toBe(true);
  });
});

describe("matchingLines", () => {
  const lines = [
    { product: "prod_A", price: "price_1", description: "A", recurring: false },
    { product: "prod_B", price: "price_2", description: "B", recurring: true },
  ];
  it("keeps only the filtered product / price", () => {
    expect(matchingLines(lines, parseProductFilter("product:prod_B")!)).toHaveLength(1);
    expect(matchingLines(lines, parseProductFilter("price:price_1")!)[0].description).toBe("A");
    expect(matchingLines(lines, parseProductFilter("product:prod_Z")!)).toHaveLength(0);
    expect(matchingLines([], parseProductFilter("product:prod_A")!)).toHaveLength(0);
  });
});

describe("fetchStripeLineItems", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(routes: Record<string, unknown>) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      const key = Object.keys(routes).find((k) => url.includes(k));
      return key
        ? new Response(JSON.stringify(routes[key]), { status: 200 })
        : new Response("not found", { status: 404 });
    }));
    return calls;
  }

  it("reads invoice lines for installment charges", async () => {
    stub({ "invoices/in_1/lines": { data: [{ description: "Rata", price: { id: "price_2", product: "prod_A", recurring: { interval: "month" } } }] } });
    const r = await fetchStripeLineItems({ id: "ch_1", object: "charge", invoice: "in_1" }, "rk");
    expect(r.viaInvoice).toBe(true);
    expect(r.items[0]).toMatchObject({ product: "prod_A", price: "price_2", recurring: true });
  });

  it("reads Checkout Session line items for one-time charges", async () => {
    const calls = stub({ "checkout/sessions?payment_intent=pi_1": { data: [{ line_items: { data: [{ description: "Jednokratno", price: { id: "price_1", product: "prod_A" } }] } }] } });
    const r = await fetchStripeLineItems({ id: "ch_1", object: "charge", invoice: null, payment_intent: "pi_1" }, "rk");
    expect(r.items[0].product).toBe("prod_A");
    expect(calls).toHaveLength(1);
  });

  it("re-reads charges that arrive without the invoice field", async () => {
    const calls = stub({ "charges/ch_1": { id: "ch_1", invoice: null, payment_intent: null } });
    const r = await fetchStripeLineItems({ id: "ch_1", object: "charge" }, "rk");
    expect(r.items).toEqual([]);
    expect(calls[0]).toContain("charges/ch_1");
  });

  it("throws on Stripe errors so the webhook can retry", async () => {
    stub({});
    await expect(fetchStripeLineItems({ id: "cs_1", object: "checkout.session" }, "rk")).rejects.toThrow(/Stripe 404/);
  });

  it("falls back to product_ids / price_ids in the charge metadata", async () => {
    stub({ "checkout/sessions?payment_intent=pi_2": { data: [] } });
    const r = await fetchStripeLineItems({
      id: "ch_2", object: "charge", invoice: null, payment_intent: "pi_2",
      description: "55 Biznis Priča – Ebook + 55 Biznis Priča – audio knjiga",
      metadata: { product_ids: "prod_E,prod_A", price_ids: "price_E,price_A" },
    }, "rk");
    expect(r.viaInvoice).toBe(false);
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toMatchObject({ product: "prod_A", price: "price_A", recurring: false });
    expect(matchingLines(r.items, parseProductFilter("product:prod_E")!)).toHaveLength(1);
  });

  it("returns no lines for a charge without invoice, session or metadata", async () => {
    stub({ "checkout/sessions?payment_intent=pi_3": { data: [] } });
    const r = await fetchStripeLineItems({ id: "ch_3", object: "charge", invoice: null, payment_intent: "pi_3", metadata: {} }, "rk");
    expect(r.items).toHaveLength(0);
  });
});
