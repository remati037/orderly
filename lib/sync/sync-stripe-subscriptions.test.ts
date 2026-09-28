import { describe, expect, it } from "vitest";
import { mapSubStatus, monthlyAmount } from "./sync-stripe-subscriptions";

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
