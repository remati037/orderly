import { describe, expect, it } from "vitest";
import { isFullyRefunded, stripeRefundRows, unknownRefundIds, voidStripeRefundIds, wooRefundRows } from "./refunds";

const ids = { orderId: "o1", siteId: "s1" };

describe("wooRefundRows", () => {
  const order = {
    currency: "EUR",
    date_modified_gmt: "2026-08-03T11:19:15",
    refunds: [{ id: 501, reason: "", total: "-47.00" }, { id: 502, reason: "dupla uplata", total: "-10.5" }],
  };

  it("uses the refund's own date and amount when the details are known", () => {
    const rows = wooRefundRows(order, ids, [
      { id: 501, amount: "47.00", date_created_gmt: "2026-08-02T09:00:00", reason: "Refunded via Stripe dashboard" },
    ]);
    expect(rows[0]).toEqual({
      order_id: "o1", site_id: "s1", source: "woocommerce", external_id: "501", amount: 47,
      currency: "EUR", reason: "Refunded via Stripe dashboard", refunded_at: "2026-08-02T09:00:00.000Z",
    });
  });

  it("falls back to the order's modification time and the payload amount", () => {
    const rows = wooRefundRows(order, ids);
    expect(rows[1]).toMatchObject({ external_id: "502", amount: 10.5, reason: "dupla uplata", refunded_at: "2026-08-03T11:19:15.000Z" });
    expect(rows[0].reason).toBeNull();
  });

  it("handles orders without refunds", () => {
    expect(wooRefundRows({ refunds: null }, ids)).toEqual([]);
    expect(unknownRefundIds({ refunds: undefined }, [])).toEqual([]);
  });

  it("knows which refund ids are new", () => {
    expect(unknownRefundIds(order, ["501"])).toEqual([502]);
  });
});

describe("stripeRefundRows", () => {
  const charges = new Map([["ch_1", "o1"]]);
  const r = (o: Partial<Parameters<typeof stripeRefundRows>[0][0]>) => ({
    id: "re_1", amount: 4700, currency: "eur", charge: "ch_1", created: 1_760_000_000, status: "succeeded", ...o,
  });

  it("maps refunds of charges we track, in major units", () => {
    expect(stripeRefundRows([r({ reason: "requested_by_customer" })], "s1", charges)).toEqual([{
      order_id: "o1", site_id: "s1", source: "stripe", external_id: "re_1", amount: 47, currency: "EUR",
      reason: "requested_by_customer", refunded_at: new Date(1_760_000_000_000).toISOString(),
    }]);
  });

  it("skips other sites' charges and refunds that never went through", () => {
    expect(stripeRefundRows([r({ charge: "ch_other" }), r({ id: "re_2", status: "failed" })], "s1", charges)).toEqual([]);
    expect(voidStripeRefundIds([r({ id: "re_2", status: "canceled" }), r({})])).toEqual(["re_2"]);
  });

  it("keeps zero-decimal currencies as they are", () => {
    expect(stripeRefundRows([r({ amount: 500, currency: "jpy" })], "s1", charges)[0].amount).toBe(500);
  });
});

describe("isFullyRefunded", () => {
  it("is true only when nothing of the charge is left", () => {
    expect(isFullyRefunded({ amount: 4700, amount_refunded: 4700 })).toBe(true);
    expect(isFullyRefunded({ amount: 4700, amount_refunded: 1000 })).toBe(false);
    expect(isFullyRefunded({ refunded: true })).toBe(true);
  });
});
