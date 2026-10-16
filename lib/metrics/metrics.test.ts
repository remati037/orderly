import { describe, expect, it } from "vitest";
import {
  METRICS, PAID_STATUSES, currentMrr, mrrAt, orderFee, orderKeptShare, orderNet, subscriptionMrr,
  summarizeRevenue, summarizeRevenueBy, sumDays, totalsByDay,
} from ".";

const RATES = { EUR: 1, RSD: 0.00855, USD: 0.92 };
const o = (total: number, extra: Partial<Parameters<typeof orderFee>[0] & { currency: string; net_profit: number }> = {}) => ({
  total, currency: "EUR", net_profit: total, payment_method: "bacs", processor_fee: null, ...extra,
});

describe("summarizeRevenue", () => {
  it("net = gross − refunds made in the period, in the base currency", () => {
    const s = summarizeRevenue(
      [o(100), o(11700, { currency: "RSD", net_profit: 11700 })],
      [{ amount: 40, currency: "EUR", order: { total: 100, net_profit: 50 } }],
      RATES
    );
    expect(s.gross).toBeCloseTo(100 + 100.035, 3);
    expect(s.refunds).toBe(40);
    expect(s.net).toBeCloseTo(160.035, 3);
    expect(s.orders).toBe(2);
    expect(s.aov).toBeCloseTo(80.0175, 3);
    expect(s.netProfit).toBeCloseTo(100 + 100.035 - 20, 3); // refund takes its share of profit
  });

  it("is zero-safe", () => {
    expect(summarizeRevenue([], [], RATES)).toMatchObject({ net: 0, aov: 0, orders: 0 });
  });

  it("uses the real Stripe fee, else 5% for card payments only", () => {
    expect(orderFee({ total: 100, payment_method: "stripe", processor_fee: 1.7 })).toBe(1.7);
    expect(orderFee({ total: 100, payment_method: "stripe_cc", processor_fee: null })).toBe(5);
    expect(orderFee({ total: 100, payment_method: "bacs", processor_fee: null })).toBe(0);
  });

  it("counts refunded orders as paid", () => {
    expect(PAID_STATUSES).toContain("refunded");
    expect(METRICS.net_revenue.higherIsBetter).toBe(true);
    expect(METRICS.refunds.higherIsBetter).toBe(false);
  });
});

describe("summarizeRevenueBy", () => {
  it("splits orders and refunds by key; a refund-only key goes negative", () => {
    const orders = [{ ...o(100), site: "a" }, { ...o(50), site: "b" }, { ...o(30), site: "a" }];
    const refunds = [
      { amount: 20, currency: "EUR", order: { total: 100, net_profit: 100 }, site: "a" },
      { amount: 10, currency: "EUR", order: { total: 10, net_profit: 10 }, site: "c" },
    ];
    const by = summarizeRevenueBy(orders, refunds, RATES, (x) => x.site, (r) => r.site);
    expect(by.get("a")).toMatchObject({ gross: 130, refunds: 20, net: 110, orders: 2, aov: 55 });
    expect(by.get("b")).toMatchObject({ net: 50, orders: 1 });
    expect(by.get("c")).toMatchObject({ net: -10, orders: 0, aov: 0 });
    const total = [...by.values()].reduce((s, v) => s + v.net, 0);
    expect(total).toBeCloseTo(summarizeRevenue(orders, refunds, RATES).net, 6);
  });
});

describe("per-order net", () => {
  it("is total − refunded_total, and the kept share is clamped to 0…1", () => {
    expect(orderNet({ total: 100, refunded_total: 30 })).toBe(70);
    expect(orderNet({ total: 100 })).toBe(100);
    expect(orderKeptShare({ total: 100, refunded_total: 30 })).toBeCloseTo(0.7, 6);
    expect(orderKeptShare({ total: 100, refunded_total: 100 })).toBe(0);
    expect(orderKeptShare({ total: 100, refunded_total: 120 })).toBe(0);
    expect(orderKeptShare({ total: 0, refunded_total: 0 })).toBe(1);
    expect(orderKeptShare({ total: null })).toBe(1);
  });
});

describe("daily totals", () => {
  const row = (day: string, currency: string, gross: number, refunds = 0) => ({
    site_id: "s", day, currency, orders: 1, gross, refunds, refund_count: refunds ? 1 : 0,
    net: gross - refunds, net_profit: gross, fees: 0,
  });

  it("folds sites and currencies into one base-currency total per day", () => {
    const days = totalsByDay([row("2026-10-02", "EUR", 50), row("2026-10-01", "RSD", 11700), row("2026-10-01", "EUR", 10, 4)], RATES);
    expect(days.map((d) => d.day)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(days[0].net).toBeCloseTo(100.035 + 6, 3);
    expect(sumDays(days)).toMatchObject({ orders: 3, refundCount: 1 });
  });
});

describe("MRR", () => {
  const sub = (o: Partial<Parameters<typeof subscriptionMrr>[0]>) => ({
    status: "active", mrr: 0, started_at: "2026-01-01", cancelled_at: null, ...o,
  });

  it("converts the charged amount at today's rates, falling back to the frozen value", () => {
    expect(subscriptionMrr(sub({ mrr_amount: 2000, mrr_currency: "RSD", mrr: 99 }), RATES)).toBeCloseTo(17.1, 5);
    expect(subscriptionMrr(sub({ mrr: 12 }), RATES)).toBe(12);
    expect(subscriptionMrr(sub({ mrr_amount: 10, mrr_currency: "USD" }), { ...RATES, USD: 0.5 })).toBe(5);
  });

  it("counts only active subscriptions now", () => {
    expect(currentMrr([sub({ mrr: 10 }), sub({ mrr: 5, status: "trial" }), sub({ mrr: 7, status: "cancelled" })], RATES)).toBe(10);
  });

  it("MRR at a past date includes subs cancelled after it", () => {
    const subs = [
      sub({ mrr: 10 }),
      sub({ mrr: 20, status: "cancelled", cancelled_at: "2026-10-05" }),
      sub({ mrr: 40, status: "cancelled", cancelled_at: "2026-09-15" }),
      sub({ mrr: 80, started_at: "2026-10-10" }),
    ];
    expect(mrrAt(subs, "2026-10-01", RATES)).toBe(30);
    expect(mrrAt(subs, "2026-11-01", RATES)).toBe(90);
  });
});
