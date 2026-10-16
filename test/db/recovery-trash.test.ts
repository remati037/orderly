import { describe, expect, it } from "vitest";
import { migratedDb } from "./pglite";

describe("028 recovery card for a trashed order", () => {
  it("closes as otkazano when the order goes to the Woo trash", async () => {
    const db = await migratedDb();
    const site = (await db.query<{ id: string }>(
      "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id")).rows[0].id;
    const order = (await db.query<{ id: string }>(
      `INSERT INTO orders (site_id, woo_order_id, source, status, total) VALUES ($1, '1', 'woocommerce', 'on-hold', 50)
       RETURNING id`, [site])).rows[0].id;
    await db.query("UPDATE orders SET status = 'trash' WHERE id = $1", [order]);
    const { rows } = await db.query<{ stage: string }>("SELECT stage FROM recovery_tasks WHERE order_id = $1", [order]);
    expect(rows).toEqual([{ stage: "otkazano" }]);
  }, 60_000);
});
