// One-off: pull refund history into `refunds` (migration 023) from the source
// platforms, using the same mapping code as the webhooks (lib/sync/refunds.ts).
//
//   npm run refunds:backfill            dry run: what would be written, per site and month
//   npm run refunds:backfill -- --yes   write it, then mark fully refunded Stripe
//                                       charges as refunded and refresh customer totals
//
// Re-runnable: rows are keyed by the platform's refund id. Site API keys are read
// from the database and never printed. Needs the same .env.local as db.mjs.

import { parseArgs } from "node:util";
import {
  fetchStripeRefunds,
  fetchWooRefunds,
  stripeRefundRows,
  wooRefundRows,
  type RefundRow,
  type WooOrderRefundRef,
} from "../lib/sync/refunds.ts";

const { values: args } = parseArgs({ options: { yes: { type: "boolean", default: false } } });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !projectRef) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body as T[];
}
const q = (v: string | null) => (v == null ? "NULL" : `'${v.replaceAll("'", "''")}'`);

interface Site {
  id: string;
  name: string;
  platform: string;
  url: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
}

const sites = await sql<Site>(
  "SELECT id, name, platform, url, consumer_key, consumer_secret FROM sites WHERE is_active ORDER BY name"
);
const rows: RefundRow[] = [];
const problems: string[] = [];

// ── WooCommerce: every order whose payload lists refunds ─────────────────────
for (const site of sites.filter((s) => s.platform === "woocommerce")) {
  const orders = await sql<{
    id: string; woo_order_id: string; currency: string; refunds: WooOrderRefundRef[]; modified: string | null;
  }>(`
    SELECT id, woo_order_id, currency, woo_data -> 'refunds' AS refunds,
           woo_data ->> 'date_modified_gmt' AS modified
      FROM orders
     WHERE site_id = ${q(site.id)} AND source = 'woocommerce'
       AND jsonb_typeof(woo_data -> 'refunds') = 'array'
       AND jsonb_array_length(woo_data -> 'refunds') > 0`);

  for (const o of orders) {
    let details: Awaited<ReturnType<typeof fetchWooRefunds>> = [];
    if (site.url && site.consumer_key && site.consumer_secret) {
      details = await fetchWooRefunds(
        { url: site.url, consumer_key: site.consumer_key, consumer_secret: site.consumer_secret },
        o.woo_order_id
      ).catch((err) => {
        problems.push(`${site.name} #${o.woo_order_id}: ${err.message} (datum = poslednja izmena porudžbine)`);
        return [];
      });
    }
    rows.push(
      ...wooRefundRows(
        { refunds: o.refunds, currency: o.currency, date_modified_gmt: o.modified },
        { orderId: o.id, siteId: site.id },
        details
      )
    );
  }
}

// ── Stripe: the account's whole refund history, matched to our charges ──────
for (const site of sites.filter((s) => s.platform === "stripe")) {
  if (!site.consumer_key) {
    problems.push(`${site.name}: nema Stripe ključa`);
    continue;
  }
  const refunds = await fetchStripeRefunds(site.consumer_key, {}).catch((err) => {
    problems.push(`${site.name}: ${err.message}`);
    return [];
  });
  const charges = [...new Set(refunds.map((r) => r.charge).filter((c): c is string => !!c))];
  const map = new Map<string, string>();
  for (let i = 0; i < charges.length; i += 500) {
    const found = await sql<{ id: string; woo_order_id: string }>(
      `SELECT id, woo_order_id FROM orders WHERE site_id = ${q(site.id)} AND source = 'stripe'
         AND woo_order_id IN (${charges.slice(i, i + 500).map(q).join(",")})`
    );
    for (const f of found) map.set(f.woo_order_id, f.id);
  }
  rows.push(...stripeRefundRows(refunds, site.id, map));
  const unmatched = refunds.filter((r) => !r.charge || !map.has(r.charge)).length;
  if (unmatched) console.log(`${site.name}: ${unmatched} Stripe refundacija za naplate koje Orderly nema (drugi sajt na istom nalogu ili preskočene) — ignorisano`);
}

// ── Report ───────────────────────────────────────────────────────────────────
const siteName = new Map(sites.map((s) => [s.id, s.name]));
const summary = new Map<string, { n: number; amount: number }>();
for (const r of rows) {
  const key = `${siteName.get(r.site_id)} | ${r.refunded_at.slice(0, 7)} | ${r.currency}`;
  const s = summary.get(key) ?? { n: 0, amount: 0 };
  s.n++;
  s.amount += r.amount;
  summary.set(key, s);
}
console.table(
  [...summary.entries()].sort().map(([k, v]) => {
    const [sajt, mesec, valuta] = k.split(" | ");
    return { sajt, mesec, valuta, refundacija: v.n, iznos: Math.round(v.amount * 100) / 100 };
  })
);
const [{ ok: hasTable }] = await sql<{ ok: boolean }>("SELECT to_regclass('public.refunds') IS NOT NULL AS ok");
const existing = hasTable ? (await sql<{ n: number }>("SELECT count(*)::int AS n FROM refunds"))[0].n : null;
console.log(
  `Ukupno: ${rows.length} refundacija (u bazi već: ${existing ?? "tabela refunds još ne postoji, prvo migracija 023"}).`
);
for (const p of problems) console.log(`! ${p}`);

if (!args.yes) {
  console.log("\nDry run. Za upis: npm run refunds:backfill -- --yes");
  process.exit(0);
}

for (let i = 0; i < rows.length; i += 200) {
  const values = rows
    .slice(i, i + 200)
    .map((r) =>
      `(${q(r.order_id)}, ${q(r.site_id)}, ${q(r.source)}, ${q(r.external_id)}, ${r.amount}, ${q(r.currency)}, ${q(r.reason)}, ${q(r.refunded_at)})`
    )
    .join(",\n");
  await sql(`
    INSERT INTO refunds (order_id, site_id, source, external_id, amount, currency, reason, refunded_at)
    VALUES ${values}
    ON CONFLICT (site_id, source, external_id) DO UPDATE
      SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, reason = EXCLUDED.reason,
          refunded_at = EXCLUDED.refunded_at, updated_at = NOW()`);
}

// Stripe orders keep the status of the original charge; a fully refunded one
// becomes 'refunded' like Woo does it (it still counts in gross, see lib/metrics).
const flipped = await sql<{ n: number }>(`
  WITH u AS (
    UPDATE orders SET status = 'refunded', updated_at = NOW()
     WHERE source = 'stripe' AND status = 'completed' AND refunded_total > 0 AND refunded_total >= total
    RETURNING 1)
  SELECT count(*)::int AS n FROM u`);
const customers = await sql<{ n: number }>("SELECT refresh_all_customer_totals() AS n");
console.log(`Upisano ${rows.length} refundacija; Stripe porudžbina označeno kao refunded: ${flipped[0].n}; osveženo kupaca: ${customers[0].n}.`);
