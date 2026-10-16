import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb } from "./pglite";

let db: PGlite;
let siteId: string;

const stats = async () =>
  (await db.query<Record<string, unknown>>(
    `SELECT day::text, currency, orders, gross::float, refunds::float, refund_count, net::float,
            net_profit::float, fees::float
       FROM daily_stats ORDER BY day, currency`
  )).rows;

async function order(o: { at: string; total: number; status?: string; currency?: string; profit?: number; pm?: string }) {
  return (await db.query<{ id: string }>(
    `INSERT INTO orders (site_id, woo_order_id, source, status, total, currency, net_profit, payment_method, created_at)
     VALUES ($1, gen_random_uuid()::text, 'woocommerce', $2, $3, $4, $5, $6, $7) RETURNING id`,
    [siteId, o.status ?? "completed", o.total, o.currency ?? "EUR", o.profit ?? o.total, o.pm ?? "bacs", o.at]
  )).rows[0].id;
}

beforeAll(async () => {
  db = await migratedDb();
  siteId = (await db.query<{ id: string }>(
    "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id"
  )).rows[0].id;
}, 60_000);

describe("daily_stats", () => {
  it("buckets by Belgrade day, per currency, and ignores unpaid orders", async () => {
    await order({ at: "2026-10-01T21:59:00Z", total: 40 });             // 23:59 Belgrade, Oct 1
    await order({ at: "2026-10-01T22:01:00Z", total: 60, pm: "stripe" }); // 00:01 Belgrade, Oct 2
    await order({ at: "2026-10-01T10:00:00Z", total: 5000, currency: "RSD" });
    await order({ at: "2026-10-01T10:00:00Z", total: 999, status: "failed" });
    expect(await stats()).toEqual([
      { day: "2026-10-01", currency: "EUR", orders: 1, gross: 40, refunds: 0, refund_count: 0, net: 40, net_profit: 40, fees: 0 },
      { day: "2026-10-01", currency: "RSD", orders: 1, gross: 5000, refunds: 0, refund_count: 0, net: 5000, net_profit: 5000, fees: 0 },
      { day: "2026-10-02", currency: "EUR", orders: 1, gross: 60, refunds: 0, refund_count: 0, net: 60, net_profit: 60, fees: 3 },
    ]);
  });

  it("puts a refund on the day it happened and moves an order when its status changes", async () => {
    await db.query("DELETE FROM orders");
    const id = await order({ at: "2026-09-10T10:00:00Z", total: 100, profit: 50 });
    await db.query(
      `INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, refunded_at)
       VALUES ($1, $2, 'woocommerce', 'r1', 40, 'EUR', '2026-10-03T10:00:00Z')`, [id, siteId]);
    expect(await stats()).toEqual([
      { day: "2026-09-10", currency: "EUR", orders: 1, gross: 100, refunds: 0, refund_count: 0, net: 100, net_profit: 50, fees: 0 },
      { day: "2026-10-03", currency: "EUR", orders: 0, gross: 0, refunds: 40, refund_count: 1, net: -40, net_profit: -20, fees: 0 },
    ]);

    await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [id]);
    expect((await stats()).map((r) => [r.day, r.orders, r.gross])).toEqual([["2026-10-03", 0, 0]]);
  });

  it("matches a full rebuild after many changes", async () => {
    for (let i = 0; i < 20; i++) await order({ at: `2026-08-${10 + (i % 5)}T12:00:00Z`, total: 10 + i, pm: i % 2 ? "stripe" : "bacs" });
    await db.query("UPDATE orders SET total = total + 1 WHERE total > 20");
    await db.query("DELETE FROM orders WHERE total = 12");
    const live = await stats();
    await db.query("DELETE FROM daily_stats");
    await db.query("SELECT rebuild_daily_stats()");
    expect(await stats()).toEqual(live);
  });

  it("never blocks an order write when the stats trigger fails", async () => {
    await db.query("ALTER TABLE daily_stats RENAME TO daily_stats_x");
    try {
      await expect(order({ at: "2026-10-05T10:00:00Z", total: 1 })).resolves.toBeTruthy();
    } finally {
      await db.query("ALTER TABLE daily_stats_x RENAME TO daily_stats");
    }
  });
});
