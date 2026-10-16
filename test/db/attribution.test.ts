import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb, migrationFiles, readMigration } from "./pglite";

const meta = (o: Record<string, string>) =>
  JSON.stringify({ meta_data: Object.entries(o).map(([k, v]) => ({ id: 1, key: `_wc_order_attribution_${k}`, value: v })) });

const FULL = meta({
  source_type: "utm", utm_source: "youtube.com", utm_medium: "social",
  utm_campaign: "Akcija+menja+život+", utm_content: "", referrer: "https://www.youtube.com/",
  session_entry: "https://shop.rs/kurs?a=1+2", device_type: "Mobile", session_pages: "9", session_count: "x",
});

let db: PGlite;
let siteId: string;

beforeAll(async () => {
  db = await migratedDb();
  siteId = (await db.query<{ id: string }>(
    "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING id"
  )).rows[0].id;
}, 60_000);

const insert = (wooData: string, source = "woocommerce") =>
  db.query<Record<string, unknown>>(
    `INSERT INTO orders (site_id, woo_order_id, source, status, total, woo_data)
     VALUES ($1, gen_random_uuid()::text, $2, 'completed', 10, $3::jsonb)
     RETURNING source_type, utm_source, utm_medium, utm_campaign, utm_content, referrer,
               landing_page, device_type, session_pages, session_count`,
    [siteId, source, wooData]
  ).then((r) => r.rows[0]);

describe("order attribution", () => {
  it("lifts _wc_order_attribution_* into columns on insert", async () => {
    expect(await insert(FULL)).toEqual({
      source_type: "utm", utm_source: "youtube.com", utm_medium: "social",
      utm_campaign: "Akcija menja život", utm_content: null, referrer: "https://www.youtube.com/",
      landing_page: "https://shop.rs/kurs?a=1+2", device_type: "Mobile", session_pages: 9, session_count: null,
    });
  });

  it("follows woo_data on update and ignores non-Woo orders", async () => {
    const row = await insert("{}");
    expect(row.source_type).toBeNull();
    const stripe = await insert(FULL, "stripe");
    expect(stripe.utm_source).toBeNull();
  });

  it("re-applying the migration backfills existing orders", async () => {
    await db.query("UPDATE orders SET utm_source = NULL");
    const file = migrationFiles(24).at(-1)!;
    await db.exec(readMigration(file));
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int n FROM orders WHERE utm_source = 'youtube.com'");
    expect(rows[0].n).toBe(1);
  });
});
