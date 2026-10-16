import { describe, expect, it } from "vitest";
import { migratedDb, migrationFiles, readMigration } from "./pglite";

// Production has ~9k customers and ~7k orders; 025 must stay well inside the
// Management API's statement timeout (it once compared every customer with every other).
describe("025 at production size", () => {
  it("runs in seconds on 9k customers / 7k orders", async () => {
    const db = await migratedDb(24);
    const site = (await db.query<{ id: string }>(
      "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id")).rows[0].id;
    await db.query(`INSERT INTO customers (email, created_at)
      SELECT CASE WHEN g % 200 = 0 THEN 'Dup' || (g / 200) || '@X.rs' ELSE 'c' || g || '@x.rs' END,
             '2025-01-01'::timestamptz + g * interval '1 minute'
        FROM generate_series(1, 9000) g`);
    await db.query(`INSERT INTO customers (email) SELECT 'dup' || g || '@x.rs' FROM generate_series(1, 45) g`);
    await db.query(`INSERT INTO orders (site_id, woo_order_id, source, status, total, customer_email)
      SELECT $1, g::text, 'woocommerce', 'completed', 10, 'C' || (g % 4000) || '@x.rs' FROM generate_series(1, 7000) g`, [site]);

    const t = Date.now();
    await db.exec(readMigration(migrationFiles(25).at(-1)!));
    const ms = Date.now() - t;

    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM customers WHERE email LIKE 'dup%'")).rows[0].n).toBe(45);
    // Every order whose customer exists is linked.
    expect((await db.query<{ n: number }>(
      "SELECT count(*)::int n FROM orders o WHERE o.customer_id IS NULL AND EXISTS (SELECT 1 FROM customers c WHERE c.email = o.customer_email)"
    )).rows[0].n).toBe(0);
    expect(ms).toBeLessThan(15_000);
  }, 120_000);
});
