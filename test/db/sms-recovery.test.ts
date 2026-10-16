import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb } from "./pglite";

// Migration 020: reminders are queued by trigger, cancelled by trigger, and only
// handed to the gateway through sms_claim().
let db: PGlite;
let siteId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

async function enable(from = "2000-01-01T00:00:00Z") {
  await db.query(
    `UPDATE settings SET value = value || jsonb_build_object('enabled', true, 'enabled_from', $1::text)
      WHERE key = 'sms_recovery'`,
    [from]
  );
}

async function failedOrder(opts: { phone?: string | null; email?: string; number?: string; link?: string | null } = {}) {
  const o = await one<{ id: string }>(
    `INSERT INTO orders (site_id, woo_order_id, source, status, total, currency, customer_name,
                         customer_email, customer_phone, woo_data)
     VALUES ($1, $2, 'woocommerce', 'failed', 4990, 'RSD', 'Marko Marković', $3, $4,
             CASE WHEN $5::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('payment_url', $5::text) END)
     RETURNING id`,
    [siteId, opts.number ?? "1001", opts.email ?? "marko@example.com",
     opts.phone === undefined ? "065 638 4599" : opts.phone,
     opts.link === undefined ? "https://shop.rs/pay/1001" : opts.link]
  );
  return o.id;
}

const outbox = () =>
  db.query<{ step: number; status: string; body: string; to_number: string; cancel_reason: string | null }>(
    "SELECT step, status, body, to_number, cancel_reason FROM sms_outbox ORDER BY step"
  ).then((r) => r.rows);

beforeEach(async () => {
  db = await migratedDb();
  siteId = (await one<{ id: string }>(
    "INSERT INTO sites (name, platform) VALUES ('Šuma Shop', 'woocommerce') RETURNING id"
  )).id;
}, 60_000);

describe("sms_enqueue_recovery", () => {
  it("does nothing while the feature is disabled", async () => {
    await failedOrder();
    expect(await outbox()).toEqual([]);
  });

  it("queues three ASCII reminders awaiting approval when a failed order opens a task", async () => {
    await enable();
    await failedOrder();
    const rows = await outbox();
    expect(rows.map((r) => [r.step, r.status])).toEqual([
      [1, "pending_approval"], [2, "pending_approval"], [3, "pending_approval"],
    ]);
    expect(rows[0].body).toBe(
      "Suma Shop: Placanje za porudzbinu #1001 (4990 RSD) nije prosla. Zavrsite je ovde: https://shop.rs/pay/1001"
    );
  });

  it("never messages the backlog that existed before switching on", async () => {
    await enable("2999-01-01T00:00:00Z");
    await failedOrder();
    expect(await outbox()).toEqual([]);
  });

  it("skips orders without a phone or payment link, and opted-out numbers", async () => {
    await enable();
    await failedOrder({ phone: null, number: "1" });
    await failedOrder({ link: null, number: "2" });
    await db.query("INSERT INTO sms_optouts (phone_key) VALUES (sms_phone_key('+381656384599'))");
    await failedOrder({ number: "3" });
    expect(await outbox()).toEqual([]);
  });

  it("sends one sequence per customer even with several failed orders", async () => {
    await enable();
    await failedOrder({ number: "1" });
    await failedOrder({ number: "2", phone: "+381 65 638 4599" });
    expect(await outbox()).toHaveLength(3);
  });
});

describe("cancellation", () => {
  it("cancels unsent reminders when the customer pays", async () => {
    await enable();
    const orderId = await failedOrder();
    await db.query("UPDATE orders SET status = 'processing' WHERE id = $1", [orderId]);
    const rows = await outbox();
    expect(rows.every((r) => r.status === "cancelled" && r.cancel_reason === "customer paid")).toBe(true);
  });

  it("honours STOP and logs the reply on the task", async () => {
    await enable();
    await failedOrder();
    await db.query("INSERT INTO sms_inbox (from_number, body) VALUES ('+381656384599', ' Stop ')");
    expect((await outbox()).every((r) => r.status === "cancelled")).toBe(true);
    const note = await one<{ channel: string; body: string }>("SELECT channel, body FROM recovery_notes");
    expect(note).toEqual({ channel: "sms", body: "Odgovor kupca:  Stop " });
    expect(await one("SELECT count(*)::int AS n FROM sms_optouts")).toEqual({ n: 1 });
  });
});

describe("sms_claim", () => {
  const NOON = "2026-10-16T10:00:00Z"; // 12:00 in Belgrade
  const NIGHT = "2026-10-16T21:30:00Z"; // 23:30 in Belgrade

  async function approveAll() {
    await db.query("UPDATE sms_outbox SET status = 'approved', due_at = '2026-10-01'");
  }

  it("hands out only approved, due messages, once", async () => {
    await enable();
    await failedOrder();
    expect((await db.query("SELECT * FROM sms_claim(10, $1)", [NOON])).rows).toEqual([]);
    await approveAll();
    const first = await db.query("SELECT * FROM sms_claim(10, $1)", [NOON]);
    expect(first.rows).toHaveLength(3);
    expect((await db.query("SELECT * FROM sms_claim(10, $1)", [NOON])).rows).toEqual([]);
    expect((await outbox()).every((r) => r.status === "sending")).toBe(true);
  });

  it("sends nothing outside 08–21 Belgrade time", async () => {
    await enable();
    await failedOrder();
    await approveAll();
    expect((await db.query("SELECT * FROM sms_claim(10, $1)", [NIGHT])).rows).toEqual([]);
  });

  it("drops reminders once the customer paid another order", async () => {
    await enable();
    await failedOrder();
    await approveAll();
    await db.query(
      `INSERT INTO orders (site_id, woo_order_id, source, status, total, customer_email)
       VALUES ($1, '1002', 'woocommerce', 'completed', 4990, 'MARKO@example.com')`,
      [siteId]
    );
    expect((await db.query("SELECT * FROM sms_claim(10, $1)", [NOON])).rows).toEqual([]);
    expect((await outbox()).every((r) => r.cancel_reason === "customer paid another order")).toBe(true);
  });

  it("fails claims the gateway never reported back on after 24h", async () => {
    await enable();
    await failedOrder();
    await db.query("UPDATE sms_outbox SET status = 'sending', updated_at = '2026-10-14T10:00:00Z'");
    await db.query("SELECT * FROM sms_claim(10, $1)", [NOON]);
    expect((await outbox()).every((r) => r.status === "failed")).toBe(true);
  });
});
