import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb } from "./pglite";
import { summarizeRevenue, sumDays, totalsByDay, type DailyStatsRow, type RevenueOrder, type RevenueRefund } from "@/lib/metrics";

// The registry has two ways to the same number: raw orders + refunds (for
// partial periods) and daily_stats (whole days). They must never disagree.
const RATES = { EUR: 1, RSD: 0.00855, USD: 0.92 };
let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
  const site = (await db.query<{ id: string }>(
    "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id"
  )).rows[0].id;
  const statuses = ["completed", "processing", "refunded", "failed", "cancelled", "on-hold"];
  for (let i = 0; i < 120; i++) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO orders (site_id, woo_order_id, source, status, total, currency, net_profit, payment_method,
                           processor_fee, created_at)
       VALUES ($1, $2, 'woocommerce', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [site, String(i), statuses[i % 6], 10 + (i % 17) * 3, i % 5 === 0 ? "RSD" : "EUR", 5 + (i % 7),
       i % 3 ? "stripe" : "bacs", i % 4 === 0 ? 0.9 : null,
       new Date(Date.UTC(2026, 8, 1) + i * 9 * 3_600_000).toISOString()]
    );
    if (i % 6 === 2 || i % 11 === 0)
      await db.query(
        `INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, refunded_at)
         VALUES ($1, $2, 'woocommerce', $3, 7, $4, $5)`,
        [rows[0].id, site, `r${i}`, i % 5 === 0 ? "RSD" : "EUR",
         new Date(Date.UTC(2026, 8, 3) + i * 11 * 3_600_000).toISOString()]
      );
  }
}, 60_000);

describe("raw vs daily_stats", () => {
  it("give the same September totals", async () => {
    // September in Belgrade time.
    const start = "2026-08-31T22:00:00Z", end = "2026-09-30T22:00:00Z";
    const orders = (await db.query<RevenueOrder>(
      `SELECT total::float, currency, net_profit::float, payment_method, processor_fee::float FROM orders
        WHERE status IN ('completed','processing','refunded') AND created_at >= $1 AND created_at < $2`, [start, end]
    )).rows;
    const refunds = (await db.query<RevenueRefund & { t: number; p: number }>(
      `SELECT r.amount::float AS amount, r.currency, json_build_object('total', o.total::float, 'net_profit', o.net_profit::float) AS order
         FROM refunds r JOIN orders o ON o.id = r.order_id
        WHERE r.refunded_at >= $1 AND r.refunded_at < $2`, [start, end]
    )).rows;
    const raw = summarizeRevenue(orders, refunds, RATES);

    const daily = (await db.query<DailyStatsRow>(
      `SELECT site_id, day::text, currency, orders, gross::float, refunds::float, refund_count, net::float,
              net_profit::float, fees::float
         FROM daily_stats WHERE day BETWEEN '2026-09-01' AND '2026-09-30'`
    )).rows;
    const agg = sumDays(totalsByDay(daily, RATES));

    expect(raw.refundCount).toBeGreaterThan(0);
    expect(agg.orders).toBe(raw.orders);
    expect(agg.refundCount).toBe(raw.refundCount);
    for (const k of ["gross", "refunds", "net", "netProfit", "fees"] as const)
      expect(agg[k]).toBeCloseTo(raw[k], 1);
  });
});
