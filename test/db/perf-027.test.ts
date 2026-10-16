import { describe, expect, it } from "vitest";
import { migratedDb, migrationFiles, readMigration } from "./pglite";

// 027 rebuilds daily_stats inside the migration, and the refunds backfill calls
// refresh_all_customer_totals(); both must stay far below the statement timeout.
describe("027 and customer refresh at production size", () => {
  it("rebuild ~750 site-days and refresh ~4k customers in seconds", async () => {
    const db = await migratedDb(26);
    const sites: string[] = [];
    for (let i = 0; i < 5; i++)
      sites.push((await db.query<{ id: string }>(
        "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id")).rows[0].id);
    await db.query(`INSERT INTO customers (email) SELECT 'c' || g || '@x.rs' FROM generate_series(0, 4099) g`);
    await db.query(`INSERT INTO orders (site_id, woo_order_id, source, status, total, currency, customer_email, created_at)
      SELECT (ARRAY[$1,$2,$3,$4,$5]::uuid[])[1 + g % 5], g::text, 'woocommerce',
             CASE WHEN g % 7 = 0 THEN 'failed' ELSE 'completed' END, 10 + g % 50, 'EUR',
             'c' || (g % 4100) || '@x.rs', '2026-01-01'::timestamptz + (g % 151) * interval '1 day'
        FROM generate_series(1, 7000) g`, sites);

    let t = Date.now();
    await db.exec(readMigration(migrationFiles(27).at(-1)!));
    const rebuildMs = Date.now() - t;
    t = Date.now();
    await db.query("SELECT refresh_all_customer_totals()");
    const refreshMs = Date.now() - t;

    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM daily_stats")).rows[0].n).toBeGreaterThan(700);
    expect(rebuildMs).toBeLessThan(20_000);
    expect(refreshMs).toBeLessThan(20_000);
  }, 180_000);
});
