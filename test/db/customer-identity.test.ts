import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb, migrationFiles, readMigration } from "./pglite";

// Data is inserted the way production has it (before 025), then 025 runs.
let db: PGlite;
let siteId: string;
const M025 = migrationFiles(25).at(-1)!;

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

async function order(email: string | null, opts: { status?: string; total?: number; currency?: string; at?: string } = {}) {
  return (await rows<{ id: string }>(
    `INSERT INTO orders (site_id, woo_order_id, source, status, total, currency, customer_email, created_at)
     VALUES ($1, gen_random_uuid()::text, 'woocommerce', $2, $3, $4, $5, $6) RETURNING id`,
    [siteId, opts.status ?? "completed", opts.total ?? 100, opts.currency ?? "EUR", email, opts.at ?? "2026-09-01"]
  ))[0].id;
}

async function customer(email: string, totals: { spent?: number; count?: number; created?: string } = {}) {
  return (await rows<{ id: string }>(
    `INSERT INTO customers (email, total_spent, order_count, created_at, first_order_at, last_order_at)
     VALUES ($1, $2, $3, $4, '2025-01-01', '2025-06-01') RETURNING id`,
    [email, totals.spent ?? 0, totals.count ?? 0, totals.created ?? "2025-01-01"]
  ))[0].id;
}

beforeEach(async () => {
  db = await migratedDb(24);
  siteId = (await rows<{ id: string }>(
    "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id"
  ))[0].id;
}, 60_000);

describe("025 data fix", () => {
  it("merges duplicates into the oldest row, adding up orphan history", async () => {
    const keeper = await customer("ana@x.rs", { spent: 300, count: 3, created: "2024-01-01" });
    const loser = await customer(" Ana@X.rs ", { spent: 200, count: 2, created: "2025-01-01" });
    await db.query(
      "INSERT INTO subscriptions (customer_id, site_id, product_name, mrr) VALUES ($1, $2, 'Klub', 10)",
      [loser, siteId]
    );
    await db.exec(readMigration(M025));

    const left = await rows<{ id: string; email: string; total_spent: string; order_count: number }>(
      "SELECT id, email, total_spent, order_count FROM customers"
    );
    expect(left).toEqual([{ id: keeper, email: "ana@x.rs", total_spent: "500.00", order_count: 5 }]);
    expect((await rows<{ customer_id: string }>("SELECT customer_id FROM subscriptions"))[0].customer_id).toBe(keeper);
  });

  it("lower-cases emails and links every order to its customer", async () => {
    const c = await customer("Marko@Gmail.com");
    const o = await order("MARKO@gmail.com ");
    const none = await order(null);
    await db.exec(readMigration(M025));

    expect(await rows("SELECT email FROM customers")).toEqual([{ email: "marko@gmail.com" }]);
    expect(await rows("SELECT customer_email, customer_id FROM orders WHERE id = $1", [o]))
      .toEqual([{ customer_email: "marko@gmail.com", customer_id: c }]);
    expect(await rows("SELECT customer_id FROM orders WHERE id = $1", [none])).toEqual([{ customer_id: null }]);
  });
});

describe("after 025", () => {
  beforeEach(async () => {
    await db.exec(readMigration(M025));
  });

  it("links an order written before its customer exists, and one written after", async () => {
    const early = await order("Nova@x.rs");
    const c = await customer("nova@X.rs");
    const late = await order("NOVA@x.rs");
    expect(await rows("SELECT customer_id FROM orders WHERE id IN ($1, $2)", [early, late]))
      .toEqual([{ customer_id: c }, { customer_id: c }]);
  });

  it("totals are net of refunds, in the base currency, and skip unpaid orders", async () => {
    await customer("k@x.rs");
    const paid = await order("k@x.rs", { total: 100, at: "2026-08-01" });
    await order("k@x.rs", { total: 11700, currency: "RSD", at: "2026-09-01" }); // ≈ €100
    await order("k@x.rs", { status: "failed", total: 999 });
    const refunded = await order("k@x.rs", { status: "refunded", total: 50 });
    const refund = (id: string, ext: string, amount: number) =>
      db.query(
        `INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, refunded_at)
         VALUES ($1, $2, 'woocommerce', $3, $4, 'EUR', NOW())`, [id, siteId, ext, amount]);
    await refund(refunded, "r1", 50);
    await refund(paid, "r2", 30); // partial; the trigger refreshes the customer

    const [c] = await rows<{ total_spent: string; order_count: number; first_order_at: Date; last_order_at: Date }>(
      "SELECT total_spent, order_count, first_order_at, last_order_at FROM customers"
    );
    expect(Number(c.total_spent)).toBeCloseTo(70 + 11700 * 0.00855, 2);
    expect(c.order_count).toBe(2);
    expect(c.first_order_at.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("leaves customers without orders alone", async () => {
    await customer("orphan@x.rs", { spent: 999, count: 9 });
    await db.query("SELECT refresh_all_customer_totals()");
    expect(await rows("SELECT total_spent, order_count FROM customers"))
      .toEqual([{ total_spent: "999.00", order_count: 9 }]);
  });
});
