import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import { migratedDb } from "./pglite";
import { resetRateLimits, SUPPORT_RATE_LIMIT } from "@/lib/support/rate-limit";

// ── Contract (copy of Support Hub packages/core/src/orderly/contract.ts) ──────
const money = z.number().finite();
const iso = z.string().min(1);
const OrderlySite = z.object({ id: z.string().min(1), name: z.string(), url: z.string(), platform: z.string() });
const OrderlySitesResponse = z.object({ sites: z.array(OrderlySite) });
const OrderlyOrderStatus = z.enum(["paid", "pending", "on_hold", "refunded", "partially_refunded", "cancelled", "failed"]);
const OrderlyOrder = z.object({
  id: z.string(),
  site_id: z.string(),
  site_name: z.string(),
  number: z.string(),
  status: OrderlyOrderStatus,
  platform: z.string(),
  total: money,
  currency: z.string().length(3),
  refunded_amount: money,
  created_at: iso,
  paid_at: iso.nullable(),
  products: z.array(z.object({ name: z.string(), quantity: z.number().int().min(0) })),
  orderly_url: z.string().url(),
});
const OrderlySubscription = z.object({
  id: z.string(),
  site_id: z.string(),
  product: z.string(),
  status: z.enum(["active", "paused", "cancelled", "past_due", "expired"]),
  amount: money,
  currency: z.string().length(3),
  next_payment_at: iso.nullable(),
  cancelled_at: iso.nullable(),
});
const OrderlyCircleAccess = z.object({
  product: z.string(),
  group_name: z.string(),
  status: z.enum(["granted", "pending", "failed", "revoked"]),
  granted_at: iso.nullable(),
  error: z.string().nullable(),
});
const OrderlyCustomerResponse = z.object({
  found: z.boolean(),
  customer: z
    .object({
      name: z.string().nullable(),
      email: z.string(),
      first_order_at: iso.nullable(),
      orders_count: z.number().int().min(0),
      total_spent: money,
      base_currency: z.string().length(3),
      orderly_url: z.string().url(),
    })
    .nullable(),
  orders: z.array(OrderlyOrder).max(10),
  subscriptions: z.array(OrderlySubscription),
  circle_access: z.array(OrderlyCircleAccess),
  open_payment_recovery: z.boolean(),
});
// ─────────────────────────────────────────────────────────────────────────────

// The routes call adminClient(); here it is a tiny Supabase stand-in that runs
// the same filters and the same RPC against a migrated in-process Postgres.
let db: PGlite;

function table(name: string) {
  const where: [string, unknown][] = [];
  let cols = "*";
  let orderBy = "";
  const run = async (limit?: number) => {
    const sql =
      `SELECT ${cols} FROM public.${name}` +
      (where.length ? ` WHERE ${where.map(([c], i) => `${c} = $${i + 1}`).join(" AND ")}` : "") +
      (orderBy ? ` ORDER BY ${orderBy}` : "") +
      (limit ? ` LIMIT ${limit}` : "");
    const { rows } = await db.query(sql, where.map(([, v]) => v));
    return rows;
  };
  const q = {
    select(c: string) { cols = c; return q; },
    eq(c: string, v: unknown) { where.push([c, v]); return q; },
    order(c: string) { orderBy = c; return q; },
    async maybeSingle() { return { data: (await run(1))[0] ?? null, error: null }; },
    then<T>(resolve: (r: { data: unknown[]; error: null }) => T) { return run().then((data) => resolve({ data, error: null })); },
  };
  return q;
}

const fakeClient = {
  from: (t: string) => table(t),
  async rpc(fn: string, args: { p_org: string; p_email?: string; p_emails?: string[]; p_site_ids: string[] }) {
    if (fn === "support_customers_summary") {
      // Set-returning function: PostgREST hands back plain rows with ISO dates.
      const { rows } = await db.query<Record<string, unknown>>(
        "SELECT * FROM public.support_customers_summary($1, $2::text[], $3::uuid[])",
        [args.p_org, args.p_emails, args.p_site_ids]
      );
      const data = rows.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]))
      );
      return { data, error: null };
    }
    expect(fn).toBe("support_customer_lookup");
    const { rows } = await db.query<{ r: unknown }>(
      "SELECT public.support_customer_lookup($1, $2, $3::uuid[]) AS r",
      [args.p_org, args.p_email, args.p_site_ids]
    );
    return { data: rows[0].r, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => fakeClient }));

const { GET: getCustomer } = await import("@/app/api/support/customer/route");
const { GET: getSites } = await import("@/app/api/support/sites/route");
const { POST: postSummary } = await import("@/app/api/support/customers/summary/route");

const SummaryResponse = z.object({
  customers: z.array(
    z.object({
      email: z.string(),
      site_id: z.string(),
      total_spent: money,
      orders_count: z.number().int().min(1),
      last_order_at: iso,
      currency: z.string().length(3),
    })
  ),
});

const ORG = "00000000-0000-0000-0000-000000000001";
const OTHER_ORG = "00000000-0000-0000-0000-0000000000b2";
const TOKEN = "test-token-123";
const EMAIL = "ana@example.com";

let siteA: string, siteB: string, otherOrgSite: string, customerId: string;

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

async function site(name: string, org = ORG, platform = "woocommerce") {
  return (await rows<{ id: string }>(
    "INSERT INTO sites (name, platform, url, org_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, platform, `https://${name.toLowerCase()}.test/`, org]
  ))[0].id;
}

let seq = 1000;
async function order(
  siteId: string,
  opts: {
    status?: string; total?: number; currency?: string; at?: string; org?: string; email?: string;
    wooData?: object; items?: string[];
  } = {}
) {
  const id = (await rows<{ id: string }>(
    `INSERT INTO orders (site_id, woo_order_id, source, status, total, currency, customer_email, created_at, org_id, woo_data)
     VALUES ($1, $2, 'woocommerce', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      siteId, String(seq++), opts.status ?? "completed", opts.total ?? 100, opts.currency ?? "EUR",
      opts.email ?? EMAIL, opts.at ?? "2026-09-01T10:00:00Z", opts.org ?? ORG,
      JSON.stringify(opts.wooData ?? { date_paid_gmt: "2026-09-01T10:05:00" }),
    ]
  ))[0].id;
  for (const name of opts.items ?? ["Kurs"]) {
    await db.query(
      "INSERT INTO order_items (order_id, product_name, quantity, price, org_id) VALUES ($1, $2, 1, 0, $3)",
      [id, name, opts.org ?? ORG]
    );
  }
  return id;
}

async function refund(orderId: string, siteId: string, amount: number) {
  await db.query(
    `INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, refunded_at)
     VALUES ($1, $2, 'woocommerce', gen_random_uuid()::text, $3, 'EUR', '2026-09-10')`,
    [orderId, siteId, amount]
  );
}

const req = (path: string, token: string | null = TOKEN) =>
  new NextRequest(`https://orderly.test${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);

async function customer(query: string, token: string | null = TOKEN) {
  const res = await getCustomer(req(`/api/support/customer?${query}`, token));
  return { status: res.status, body: await res.json() };
}

async function summary(body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await postSummary(
    new NextRequest("https://orderly.test/api/support/customers/summary", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  db = await migratedDb();
}, 120_000);

beforeEach(async () => {
  resetRateLimits();
  await db.exec(`
    TRUNCATE refunds, circle_grants, recovery_tasks, order_items, subscriptions, orders, customers, sites CASCADE;
    DELETE FROM settings WHERE key IN ('support_hub_token_sha256', 'circle_access', 'base_currency', 'exchange_rates');
    INSERT INTO organizations (id, name) VALUES ('${OTHER_ORG}', 'Druga firma') ON CONFLICT DO NOTHING;
  `);
  await db.query("INSERT INTO settings (key, value, org_id) VALUES ('support_hub_token_sha256', $1, $2)", [
    JSON.stringify(createHash("sha256").update(TOKEN).digest("hex")),
    ORG,
  ]);
  await db.query(`INSERT INTO settings (key, value) VALUES ('base_currency', '"EUR"'), ('exchange_rates', '{"EUR": 1, "RSD": 0.01}')`);
  siteA = await site("Alfa");
  siteB = await site("Beta");
  otherOrgSite = await site("Tudji", OTHER_ORG);
  customerId = (await rows<{ id: string }>(
    "INSERT INTO customers (email, name) VALUES ($1, 'Ana Anić') RETURNING id", [EMAIL]
  ))[0].id;
});



describe("authorization", () => {
  it("401 without a token, with a wrong token, and before a token is configured", async () => {
    expect((await customer(`email=${EMAIL}&site_ids=${siteA}`, null)).status).toBe(401);
    expect((await customer(`email=${EMAIL}&site_ids=${siteA}`, "pogresan")).status).toBe(401);
    expect((await getSites(req("/api/support/sites", "pogresan"))).status).toBe(401);
    expect((await getSites(req("/api/support/sites", null))).status).toBe(401);

    await db.exec("DELETE FROM settings WHERE key = 'support_hub_token_sha256'");
    expect((await customer(`email=${EMAIL}&site_ids=${siteA}`)).status).toBe(401);
  });

  it("429 over the per-minute limit", async () => {
    for (let i = 0; i < SUPPORT_RATE_LIMIT; i++) {
      expect((await getSites(req("/api/support/sites"))).status).toBe(200);
    }
    const res = await getSites(req("/api/support/sites"));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("validation", () => {
  it("400 for a missing email, an email without @, or no site_ids", async () => {
    expect((await customer(`site_ids=${siteA}`)).status).toBe(400);
    expect((await customer(`email=ana.example.com&site_ids=${siteA}`)).status).toBe(400);
    expect((await customer(`email=${EMAIL}`)).status).toBe(400);
    expect((await customer(`email=${EMAIL}&site_ids=`)).status).toBe(400);
    expect((await customer(`email=${EMAIL}&site_ids=,,`)).status).toBe(400);
    expect((await customer(`email=${EMAIL}&site_ids=not-a-uuid`)).status).toBe(400);
  });
});

describe("GET /api/support/sites", () => {
  it("lists only the token's org sites, in the contract shape", async () => {
    const res = await getSites(req("/api/support/sites"));
    const body = OrderlySitesResponse.parse(await res.json());
    expect(body.sites.map((s) => s.name)).toEqual(["Alfa", "Beta"]);
    expect(body.sites[0]).toEqual({ id: siteA, name: "Alfa", url: "https://alfa.test/", platform: "woocommerce" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/support/customer", () => {
  it("unknown email → found: false", async () => {
    const { status, body } = await customer(`email=niko@example.com&site_ids=${siteA}`);
    expect(status).toBe(200);
    expect(OrderlyCustomerResponse.parse(body)).toEqual({
      found: false, customer: null, orders: [], subscriptions: [], circle_access: [], open_payment_recovery: false,
    });
  });

  it("matches the email the way Orderly normalizes it", async () => {
    await order(siteA);
    const { body } = await customer(`email=${encodeURIComponent("  ANA@Example.com ")}&site_ids=${siteA}`);
    expect(body.found).toBe(true);
  });

  it("returns only the requested sites (A, not B)", async () => {
    const a = await order(siteA, { total: 100 });
    await order(siteB, { total: 900 });
    await db.query(
      "INSERT INTO subscriptions (customer_id, site_id, product_name, mrr, status) VALUES ($1, $2, 'Klub B', 10, 'active')",
      [customerId, siteB]
    );

    const { body } = await customer(`email=${EMAIL}&site_ids=${siteA}`);
    const parsed = OrderlyCustomerResponse.parse(body);
    expect(parsed.orders.map((o) => o.id)).toEqual([a]);
    expect(parsed.orders.every((o) => o.site_id === siteA)).toBe(true);
    expect(parsed.subscriptions).toEqual([]);
    expect(parsed.customer?.total_spent).toBe(100);
    expect(parsed.customer?.orders_count).toBe(1);

    // Nothing at all on the requested site → found: false.
    const none = await customer(`email=${EMAIL}&site_ids=${await site("Gama")}`);
    expect(none.body.found).toBe(false);
  });

  it("never returns another organization's orders, even when its site is requested", async () => {
    const mine = await order(siteA, { total: 50 });
    await order(otherOrgSite, { total: 500, org: OTHER_ORG });
    // A row tagged with the other org on our own site doesn't leak either.
    await order(siteA, { total: 700, org: OTHER_ORG });

    const { body } = await customer(`email=${EMAIL}&site_ids=${siteA},${otherOrgSite}`);
    const parsed = OrderlyCustomerResponse.parse(body);
    expect(parsed.orders.map((o) => o.id)).toEqual([mine]);
    expect(parsed.customer?.total_spent).toBe(50);

    const onlyOther = await customer(`email=${EMAIL}&site_ids=${otherOrgSite}`);
    expect(onlyOther.body.found).toBe(false);
  });

  it("total_spent counts only paid orders, net of refunds, in the base currency", async () => {
    await order(siteA, { status: "completed", total: 100, at: "2026-09-01T10:00:00Z" });
    const partial = await order(siteA, { status: "completed", total: 200, at: "2026-09-02T10:00:00Z" });
    await refund(partial, siteA, 50);
    const full = await order(siteA, { status: "refunded", total: 80, at: "2026-09-03T10:00:00Z" });
    await refund(full, siteA, 80);
    await order(siteA, { status: "processing", total: 1000, currency: "RSD", at: "2026-09-04T10:00:00Z" }); // 10 EUR
    for (const status of ["pending", "on-hold", "cancelled", "failed", "checkout-draft"]) {
      await order(siteA, { status, total: 5000, at: "2026-09-05T10:00:00Z", wooData: {} });
    }
    await order(siteA, { status: "trash", total: 5000, at: "2026-09-06T10:00:00Z" });

    const { body } = await customer(`email=${EMAIL}&site_ids=${siteA}`);
    const parsed = OrderlyCustomerResponse.parse(body);

    // 100 + (200 − 50) + (80 − 80) + 1000 RSD × 0.01
    expect(parsed.customer?.total_spent).toBe(260);
    expect(parsed.customer?.base_currency).toBe("EUR");
    expect(parsed.customer?.orders_count).toBe(3); // fully refunded doesn't count as a purchase
    expect(parsed.customer?.first_order_at?.startsWith("2026-09-01T10:00:00")).toBe(true);

    const byStatus = Object.fromEntries(parsed.orders.map((o) => [o.status, o]));
    expect(parsed.orders.map((o) => o.status).sort()).toEqual(
      ["cancelled", "failed", "on_hold", "paid", "paid", "partially_refunded", "pending", "pending", "refunded"].sort()
    );
    expect(byStatus.partially_refunded.refunded_amount).toBe(50);
    expect(byStatus.refunded.refunded_amount).toBe(80);
    expect(byStatus.pending.paid_at).toBeNull();
    expect(byStatus.on_hold.paid_at).toBeNull();
    expect(parsed.orders.some((o) => o.total === 5000 && o.status === "cancelled")).toBe(true); // shown…
    expect(parsed.orders.length).toBe(9); // …but trash is not
  });

  it("returns the newest 10 orders with absolute Orderly links", async () => {
    for (let d = 1; d <= 12; d++) {
      await order(siteA, { total: 10, at: `2026-08-${String(d).padStart(2, "0")}T09:00:00Z` });
    }
    const { body } = await customer(`email=${EMAIL}&site_ids=${siteA}`);
    const parsed = OrderlyCustomerResponse.parse(body);
    expect(parsed.orders).toHaveLength(10);
    expect(parsed.orders[0].created_at.startsWith("2026-08-12")).toBe(true);
    expect(parsed.orders[9].created_at.startsWith("2026-08-03")).toBe(true);
    expect(parsed.customer?.orders_count).toBe(12);
    expect(parsed.customer?.total_spent).toBe(120);
    expect(parsed.customer?.orderly_url).toBe(`https://orderly.test/customers/${customerId}`);
    expect(parsed.orders[0].orderly_url).toBe(
      `https://orderly.test/porudzbine?q=${parsed.orders[0].number}&sites=${siteA}`
    );
    expect(parsed.orders[0].paid_at).toMatch(/^2026-09-01T10:05:00/); // Woo date_paid_gmt
    expect(parsed.orders[0].products).toEqual([{ name: "Kurs", quantity: 1 }]);
  });

  it("maps subscriptions, Circle access and the open Naplata card", async () => {
    const paid = await order(siteA, {
      at: "2026-10-25T10:00:00Z",
      wooData: { date_paid_gmt: "2026-10-25T10:01:00", line_items: [{ product_id: 44806, name: "AI Profit Lab" }] },
      items: ["AI Profit Lab"],
    });
    const second = await order(siteA, {
      at: "2026-10-26T10:00:00Z",
      wooData: { date_paid_gmt: "2026-10-26T10:01:00", line_items: [{ product_id: 44807, name: "500 Skillova" }] },
    });
    const third = await order(siteA, {
      at: "2026-10-27T10:00:00Z",
      wooData: { date_paid_gmt: "2026-10-27T10:01:00", line_items: [{ product_id: 44809, name: "70 Eksperata" }] },
    });
    await db.query(`INSERT INTO settings (key, value) VALUES ('circle_access', $1)`, [
      JSON.stringify({
        enabled: true,
        enabled_from: "2026-10-20T00:00:00Z",
        rules: [
          { site_id: siteA, woo_product_id: 44806, access_group_id: 124997 },
          { site_id: siteA, woo_product_id: 44807, access_group_id: 125666 },
          { site_id: siteA, woo_product_id: 44809, access_group_id: 132017 },
        ],
      }),
    ]);
    await db.query(
      `INSERT INTO circle_grants (order_id, email, access_group_id, status, last_error, granted_at) VALUES
         ($1, $3, 124997, 'ok', NULL, '2026-10-25T10:02:00Z'),
         ($2, $3, 125666, 'error', 'Circle 422: member blocked', NULL)`,
      [paid, second, EMAIL]
    );
    await db.query(
      `INSERT INTO subscriptions (customer_id, site_id, product_name, mrr, mrr_amount, mrr_currency, status, next_billing_at, cancelled_at)
       VALUES ($1, $2, 'Klub', 9.99, 1200, 'RSD', 'trial', '2026-12-01T00:00:00Z', NULL),
              ($1, $2, 'Stari klub', 5, NULL, NULL, 'cancelled', '2026-12-01T00:00:00Z', '2026-10-01T00:00:00Z')`,
      [customerId, siteA]
    );

    // An on-hold order inside the board's 30-day window opens a card (trigger from 009).
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await order(siteA, { status: "on-hold", at: recent, wooData: {} });

    const { body } = await customer(`email=${EMAIL}&site_ids=${siteA}`);
    const parsed = OrderlyCustomerResponse.parse(body);

    expect(parsed.circle_access).toEqual([
      { product: "AI Profit Lab", group_name: "Circle grupa 124997", status: "granted", granted_at: expect.stringMatching(/^2026-10-25T10:02:00/), error: null },
      { product: "500 Skillova", group_name: "Circle grupa 125666", status: "failed", granted_at: null, error: "Circle 422: member blocked" },
      { product: "70 Eksperata", group_name: "Circle grupa 132017", status: "pending", granted_at: null, error: null },
    ]);
    expect(third).toBeTruthy();

    expect(parsed.subscriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product: "Klub", status: "active", amount: 1200, currency: "RSD" }),
        expect.objectContaining({ product: "Stari klub", status: "cancelled", amount: 5, currency: "EUR", next_payment_at: null }),
      ])
    );
    expect(parsed.open_payment_recovery).toBe(true);
  });

  it("an old unpaid order doesn't count as an open Naplata card", async () => {
    await order(siteA, { status: "failed", at: "2025-01-01T10:00:00Z", wooData: {} });
    const { body } = await customer(`email=${EMAIL}&site_ids=${siteA}`);
    expect(body.found).toBe(true);
    expect(body.open_payment_recovery).toBe(false);
    expect(body.customer.total_spent).toBe(0);
    expect(body.customer.first_order_at).toBeNull();
  });

  it("only reads: both routes work on a read-only database", async () => {
    await order(siteA, { status: "failed", at: new Date().toISOString(), wooData: {} });
    await db.exec("SET default_transaction_read_only = on");
    try {
      const { status, body } = await customer(`email=${EMAIL}&site_ids=${siteA}`);
      expect(status).toBe(200);
      expect(body.found).toBe(true);
      expect((await getSites(req("/api/support/sites"))).status).toBe(200);
      // Sanity check that the switch is really on.
      await expect(db.exec("INSERT INTO organizations (name) VALUES ('x')")).rejects.toThrow(/read-only/);
    } finally {
      await db.exec("SET default_transaction_read_only = off");
    }
  });
});

describe("POST /api/support/customers/summary", () => {
  const BOB = "bob@example.com";

  it("401 without or with a wrong token", async () => {
    expect((await summary({ emails: [EMAIL], site_ids: [siteA] }, null)).status).toBe(401);
    expect((await summary({ emails: [EMAIL], site_ids: [siteA] }, "pogresan")).status).toBe(401);
  });

  it("400 for an empty list, over 500 emails, bad site_ids or a bad body", async () => {
    expect((await summary({ emails: [], site_ids: [siteA] })).status).toBe(400);
    expect((await summary({ site_ids: [siteA] })).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => `k${i}@example.com`);
    expect((await summary({ emails: many, site_ids: [siteA] })).status).toBe(400);
    expect((await summary({ emails: many.slice(0, 500), site_ids: [siteA] })).status).toBe(200);
    expect((await summary({ emails: [EMAIL], site_ids: [] })).status).toBe(400);
    expect((await summary({ emails: [EMAIL], site_ids: ["not-a-uuid"] })).status).toBe(400);
    const sites21 = Array.from({ length: 21 }, () => siteA);
    expect((await summary({ emails: [EMAIL], site_ids: sites21 })).status).toBe(400);
    expect((await summary({ emails: [42], site_ids: [siteA] })).status).toBe(400);
    expect((await summary("{nije json")).status).toBe(400);
  });

  it("one row per (email, site) with a kept paid order, same numbers as the customer card", async () => {
    await db.query("INSERT INTO customers (email, name) VALUES ($1, 'Bob')", [BOB]);
    await order(siteA, { total: 100, at: "2026-09-01T10:00:00Z" });
    const partial = await order(siteA, { total: 200, at: "2026-09-03T10:00:00Z" });
    await refund(partial, siteA, 50);
    await order(siteA, { status: "processing", total: 1000, currency: "RSD", at: "2026-09-02T10:00:00Z" });
    await order(siteA, { status: "pending", total: 999, at: "2026-09-09T10:00:00Z", wooData: {} });
    await order(siteA, { status: "failed", total: 999, at: "2026-09-09T10:00:00Z", wooData: {} });
    await order(siteB, { total: 30, at: "2026-09-05T10:00:00Z" });
    // Bob: only a fully refunded order on A → no row; one cancelled on B → no row.
    const bobRefunded = await order(siteA, { email: BOB, status: "refunded", total: 80 });
    await refund(bobRefunded, siteA, 80);
    await order(siteB, { email: BOB, status: "cancelled", total: 80, wooData: {} });
    // Another org's order and a site that wasn't asked for never count.
    await order(otherOrgSite, { total: 500, org: OTHER_ORG });
    const siteC = await site("Gama");
    await order(siteC, { total: 700 });

    const { status, body } = await summary({
      emails: [" ANA@example.com ", BOB, "niko@example.com", "bez-et"],
      site_ids: [siteA, siteB, otherOrgSite],
    });
    expect(status).toBe(200);
    const parsed = SummaryResponse.parse(body);
    expect(parsed.customers).toEqual([
      { email: EMAIL, site_id: expect.any(String), total_spent: expect.any(Number), orders_count: expect.any(Number), last_order_at: expect.any(String), currency: "EUR" },
      { email: EMAIL, site_id: expect.any(String), total_spent: expect.any(Number), orders_count: expect.any(Number), last_order_at: expect.any(String), currency: "EUR" },
    ]);
    const bySite = Object.fromEntries(parsed.customers.map((c) => [c.site_id, c]));
    expect(bySite[siteA]).toMatchObject({ total_spent: 260, orders_count: 3 }); // 100 + 150 + 1000 RSD × 0.01
    expect(bySite[siteA].last_order_at.startsWith("2026-09-03T10:00:00")).toBe(true);
    expect(bySite[siteB]).toMatchObject({ total_spent: 30, orders_count: 1 });

    for (const s of [siteA, siteB]) {
      const card = (await customer(`email=${EMAIL}&site_ids=${s}`)).body.customer;
      expect({ total_spent: card.total_spent, orders_count: card.orders_count }).toEqual({
        total_spent: bySite[s].total_spent,
        orders_count: bySite[s].orders_count,
      });
    }
  });

  it("counts as one request against the rate limit", async () => {
    for (let i = 0; i < SUPPORT_RATE_LIMIT - 1; i++) await getSites(req("/api/support/sites"));
    expect((await summary({ emails: [EMAIL], site_ids: [siteA] })).status).toBe(200);
    expect((await summary({ emails: [EMAIL], site_ids: [siteA] })).status).toBe(429);
  });

  it("only reads", async () => {
    await order(siteA);
    await db.exec("SET default_transaction_read_only = on");
    try {
      const { status, body } = await summary({ emails: [EMAIL], site_ids: [siteA] });
      expect(status).toBe(200);
      expect(body.customers).toHaveLength(1);
    } finally {
      await db.exec("SET default_transaction_read_only = off");
    }
  });
});
