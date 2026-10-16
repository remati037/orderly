import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb } from "./pglite";

let db: PGlite;
let siteId: string;

beforeAll(async () => {
  db = await migratedDb();
  siteId = (await db.query<{ id: string }>(
    "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id"
  )).rows[0].id;
}, 60_000);

async function order(total = 100) {
  return (await db.query<{ id: string }>(
    `INSERT INTO orders (site_id, woo_order_id, source, status, total, currency)
     VALUES ($1, gen_random_uuid()::text, 'woocommerce', 'completed', $2, 'EUR') RETURNING id`,
    [siteId, total]
  )).rows[0].id;
}
const refundedTotal = async (id: string) =>
  Number((await db.query<{ t: string }>("SELECT refunded_total t FROM orders WHERE id = $1", [id])).rows[0].t);

function refund(orderId: string, ext: string, amount: number) {
  return db.query(
    `INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, refunded_at)
     VALUES ($1, $2, 'woocommerce', $3, $4, 'EUR', NOW())
     ON CONFLICT (site_id, source, external_id) DO UPDATE SET amount = EXCLUDED.amount`,
    [orderId, siteId, ext, amount]
  );
}

describe("orders.refunded_total", () => {
  it("follows inserts, redeliveries, edits and deletes of refunds", async () => {
    const id = await order();
    await refund(id, "r1", 30);
    await refund(id, "r2", 20);
    expect(await refundedTotal(id)).toBe(50);
    await refund(id, "r1", 30); // webhook redelivered
    expect(await refundedTotal(id)).toBe(50);
    await refund(id, "r1", 10); // amount corrected
    expect(await refundedTotal(id)).toBe(30);
    await db.query("DELETE FROM refunds WHERE external_id = 'r2'");
    expect(await refundedTotal(id)).toBe(10);
  });

  it("moves the amount when a refund is re-pointed to another order", async () => {
    const a = await order(), b = await order();
    await refund(a, "r9", 40);
    await db.query("UPDATE refunds SET order_id = $1 WHERE external_id = 'r9'", [b]);
    expect([await refundedTotal(a), await refundedTotal(b)]).toEqual([0, 40]);
  });

  it("rejects the same refund twice and negative amounts", async () => {
    const id = await order();
    await expect(
      db.query(
        `INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, refunded_at)
         VALUES ($1, $2, 'stripe', 're_x', -5, 'EUR', NOW())`, [id, siteId])
    ).rejects.toThrow();
  });
});
