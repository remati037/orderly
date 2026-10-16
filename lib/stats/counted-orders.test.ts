import { describe, expect, it } from "vitest";
import { summarizeActivity } from "./counted-orders";

const RATES = { EUR: 1, RSD: 0.01 };
const order = (total: number, created_at: string, currency = "EUR") => ({
  total, currency, created_at, net_profit: total, payment_method: "bacs", processor_fee: null,
});
const refund = (amount: number, refunded_at: string, currency = "EUR") => ({
  amount, currency, refunded_at, order: { total: 100, net_profit: 100 },
});
const hourOf = (iso: string) => new Date(iso).getUTCHours();

describe("summarizeActivity", () => {
  it("puts orders in their creation bucket and refunds in the refund's bucket", () => {
    const s = summarizeActivity(
      {
        orders: [order(100, "2026-10-16T09:10:00Z"), order(5000, "2026-10-16T09:50:00Z", "RSD"), order(40, "2026-10-16T12:00:00Z")],
        refunds: [refund(30, "2026-10-16T11:00:00Z")],
      },
      RATES, 24, hourOf
    );
    expect(s.buckets[9]).toBeCloseTo(150, 6);
    expect(s.buckets[11]).toBe(-30);
    expect(s.buckets[12]).toBe(40);
    expect(s.orderBuckets[9]).toBe(2);
    expect(s.orderBuckets[11]).toBe(0);
    expect(s.net).toBeCloseTo(160, 6);
    expect(s.buckets.reduce((a, b) => a + b, 0)).toBeCloseTo(s.net, 6);
    expect(s.orders).toBe(3);
    expect(s.lastOrderAt).toBe("2026-10-16T12:00:00Z");
  });

  it("ignores rows outside the buckets for the split but not for the totals", () => {
    const s = summarizeActivity({ orders: [order(10, "x")], refunds: [] }, RATES, 3, () => -1);
    expect(s.buckets).toEqual([0, 0, 0]);
    expect(s.net).toBe(10);
  });

  it("is empty-safe", () => {
    const s = summarizeActivity({ orders: [], refunds: [] }, RATES, 2, hourOf);
    expect(s).toMatchObject({ net: 0, orders: 0, lastOrderAt: null, buckets: [0, 0], orderBuckets: [0, 0] });
  });
});
