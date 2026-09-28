import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { normalizeWooOrder, wooDate, type WooOrder } from "./normalize-woo-order";

// Minimal stand-in for the products lookup chain in calcNetProfit.
function fakeSupabase(products: Record<string, { cost_percent?: number; cost_fixed?: number }> = {}) {
  return {
    from: () => {
      let name = "";
      const chain = {
        select: () => chain,
        eq: () => chain,
        ilike: (_col: string, v: string) => { name = v; return chain; },
        maybeSingle: async () => ({ data: products[name] ?? null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const base: WooOrder = {
  id: 501,
  status: "processing",
  total: "100.00",
  currency: "EUR",
  date_created: "2026-09-28T23:30:00",       // shop-local (Belgrade) time
  date_created_gmt: "2026-09-28T21:30:00",   // the real UTC instant
  payment_method: "bacs",
  billing: { first_name: "Marko", last_name: "Marković", email: "marko@example.com", city: "Novi Sad" },
  line_items: [{ name: "Kurs", quantity: 1, total: "100.00" }],
};

describe("wooDate", () => {
  it("reads the _gmt value as UTC", () => {
    expect(wooDate("2026-09-28T21:30:00", "2026-09-28T23:30:00")).toBe("2026-09-28T21:30:00.000Z");
  });
  it("keeps an explicit offset and falls back to the local value", () => {
    expect(wooDate("2026-09-28T21:30:00+00:00")).toBe("2026-09-28T21:30:00.000Z");
    expect(wooDate(null, "2026-09-28T21:30:00Z")).toBe("2026-09-28T21:30:00.000Z");
    expect(wooDate(null, null)).toBeNull();
  });
});

describe("normalizeWooOrder", () => {
  it("builds the order row with the UTC created_at", async () => {
    const { orderRow, itemRows } = await normalizeWooOrder(fakeSupabase(), base, "site-1", 100);
    expect(orderRow).toMatchObject({
      site_id: "site-1",
      woo_order_id: "501",
      status: "processing",
      total: 100,
      currency: "EUR",
      customer_name: "Marko Marković",
      customer_email: "marko@example.com",
      product_type: "digital",
      created_at: "2026-09-28T21:30:00.000Z",
    });
    expect(itemRows).toEqual([{ product_name: "Kurs", product_type: "digital", quantity: 1, price: 100, cost: 0 }]);
  });

  it("applies the site margin, product cost overrides and the 5% card fee", async () => {
    const margin = await normalizeWooOrder(fakeSupabase(), base, "s", 60);
    expect(margin.orderRow.net_profit).toBe(60);

    const pct = await normalizeWooOrder(fakeSupabase({ Kurs: { cost_percent: 30 } }), base, "s", 60);
    expect(pct.orderRow.net_profit).toBe(70);

    const card = await normalizeWooOrder(fakeSupabase(), { ...base, payment_method: "stripe_cc" }, "s", 100);
    expect(card.orderRow.net_profit).toBe(95);
  });

  it("marks orders with a weighted item as physical", async () => {
    const order = { ...base, line_items: [{ name: "Knjiga", quantity: 2, total: "40.00", weight: "0.5" }] };
    const { orderRow, itemRows } = await normalizeWooOrder(fakeSupabase(), order, "s", 100);
    expect(orderRow.product_type).toBe("physical");
    expect(itemRows[0]).toMatchObject({ product_type: "physical", quantity: 2, price: 40 });
  });
});
