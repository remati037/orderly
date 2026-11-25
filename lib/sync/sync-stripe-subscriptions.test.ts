import { describe, expect, it } from "vitest";
import { mapSubStatus, matchingSubItems, monthlyAmount } from "./sync-stripe-subscriptions";
import { parseProductFilter } from "./stripe-line-items";

describe("mapSubStatus", () => {
  it("maps Stripe statuses onto ours", () => {
    expect(mapSubStatus("active")).toBe("active");
    expect(mapSubStatus("past_due")).toBe("active");
    expect(mapSubStatus("trialing")).toBe("trial");
    expect(mapSubStatus("paused")).toBe("paused");
    expect(mapSubStatus("canceled")).toBe("cancelled");
    expect(mapSubStatus("incomplete_expired")).toBe("cancelled");
  });
});

describe("monthlyAmount", () => {
  const item = (unit: number, interval: string, count = 1, quantity = 1) => ({
    quantity,
    price: { currency: "eur", unit_amount: unit, recurring: { interval, interval_count: count } },
  });

  it("normalises every billing interval to a monthly amount", () => {
    expect(monthlyAmount(item(2900, "month"))).toEqual({ amount: 29, currency: "EUR" });
    expect(monthlyAmount(item(12000, "year")).amount).toBe(10);
    expect(monthlyAmount(item(9000, "month", 3)).amount).toBe(30);
    expect(monthlyAmount(item(1000, "week")).amount).toBeCloseTo(43.33, 2);
  });

  it("multiplies by quantity and supports the legacy plan shape", () => {
    expect(monthlyAmount(item(1000, "month", 1, 3)).amount).toBe(30);
    expect(monthlyAmount({ plan: { currency: "usd", unit_amount: 500, interval: "month" } })).toEqual({ amount: 5, currency: "USD" });
  });
});

describe("matchingSubItems", () => {
  const sub = (...items: { price: string; product: string | { id: string } }[]) => ({
    items: { data: items.map((i) => ({ price: { id: i.price, product: i.product } })) },
  });
  const mine = sub({ price: "price_new", product: "apl_membership" });
  const old = sub({ price: "price_old", product: "prod_old" });

  it("keeps every subscription when the site has no product/price filter", () => {
    expect(matchingSubItems(old, parseProductFilter(""))).toHaveLength(1);
    expect(matchingSubItems(old, parseProductFilter(null))).toHaveLength(1);
    expect(matchingSubItems(old, parseProductFilter("znak"))).toHaveLength(1);
    expect(matchingSubItems(old, parseProductFilter("!znak"))).toHaveLength(1);
  });

  it("drops subscriptions for other products on a shared account", () => {
    const f = parseProductFilter("product:apl_membership");
    expect(matchingSubItems(mine, f)).toHaveLength(1);
    expect(matchingSubItems(old, f)).toHaveLength(0);
    expect(matchingSubItems({}, f)).toHaveLength(0);
  });

  it("matches expanded products, several ids and price filters", () => {
    expect(matchingSubItems(sub({ price: "p", product: { id: "prod_A" } }), parseProductFilter("product:prod_B, prod_A"))).toHaveLength(1);
    expect(matchingSubItems(old, parseProductFilter("price:price_old"))).toHaveLength(1);
    expect(matchingSubItems(mine, parseProductFilter("price:price_old"))).toHaveLength(0);
  });

  it("returns the matching item, not just the first one", () => {
    const mixed = sub({ price: "price_old", product: "prod_old" }, { price: "price_new", product: "apl_membership" });
    expect(matchingSubItems(mixed, parseProductFilter("product:apl_membership"))[0].price.id).toBe("price_new");
  });
});
