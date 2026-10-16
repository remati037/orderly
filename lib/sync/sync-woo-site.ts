import { SupabaseClient } from "@supabase/supabase-js";
// Relative imports carry .ts so scripts/woo-resync.mts can run this with plain node.
import { normalizeWooOrder, type WooOrder } from "./normalize-woo-order.ts";
import { upsertWooOrder, upsertCustomer, logSync } from "./db.ts";
import { syncWooOrderRefunds } from "./refunds-db.ts";

interface WooSite {
  id: string;
  name: string;
  url: string;
  consumer_key: string;
  consumer_secret: string;
  default_margin_percent: number;
}

export interface WooSyncResult {
  synced: number;
  failed: number;
  // false when paging stopped on an API error — the set of orders seen is then
  // incomplete and must not be used to decide which local orders to delete.
  complete: boolean;
  seenWooIds: Set<string>;
  error?: string;
}

const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET with a timeout, retrying 429 / 5xx / network errors with backoff.
async function fetchWooPage(url: string, auth: string): Promise<WooOrder[]> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as WooOrder[];
      lastError = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break; // 4xx won't fix itself
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
  }
  throw new Error(lastError);
}

// One Woo order through the same steps as the webhook: order, refunds, customer.
export async function ingestWooOrder(supabase: SupabaseClient, site: WooSite, order: WooOrder): Promise<boolean> {
  try {
    const normalized = await normalizeWooOrder(supabase, order, site.id, site.default_margin_percent ?? 100);
    const orderId = await upsertWooOrder(supabase, normalized);
    if (!orderId) return false;
    await syncWooOrderRefunds(supabase, site, order, orderId);
    if (normalized.orderRow.customer_email) {
      await upsertCustomer(
        supabase,
        normalized.orderRow.customer_email,
        normalized.orderRow.customer_name,
        normalized.orderRow.customer_city
      );
    }
    return true;
  } catch {
    return false;
  }
}

const wooAuth = (site: WooSite) =>
  Buffer.from(`${site.consumer_key}:${site.consumer_secret}`).toString("base64");
const wooBase = (site: WooSite) => `${site.url.replace(/\/$/, "")}/wp-json/wc/v3/orders`;

/** Re-pull specific orders by Woo id (repairs, missed webhooks). */
export async function syncWooOrdersById(
  supabase: SupabaseClient,
  site: WooSite,
  wooIds: (string | number)[]
): Promise<{ synced: number; failed: number; missing: string[] }> {
  const out = { synced: 0, failed: 0, missing: [] as string[] };
  for (let i = 0; i < wooIds.length; i += 100) {
    const chunk = wooIds.slice(i, i + 100).map(String);
    const orders = await fetchWooPage(
      `${wooBase(site)}?per_page=100&status=any&include=${chunk.join(",")}`,
      wooAuth(site)
    );
    const found = new Set(orders.map((o) => String(o.id)));
    out.missing.push(...chunk.filter((id) => !found.has(id)));
    for (const order of orders) {
      if (order.status === "trash") continue; // handled by markWooOrdersTrashed
      if (await ingestWooOrder(supabase, site, order)) out.synced++;
      else out.failed++;
    }
  }
  return out;
}

/**
 * Orders moved to the Woo trash. Deleting fires no order.updated, and the
 * orders API leaves trashed orders out unless asked, so without this a trashed
 * test order would stay in revenue forever.
 */
export async function fetchWooTrashedIds(site: WooSite, modifiedAfter?: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page < 100; page++) {
    let url = `${wooBase(site)}?status=trash&per_page=100&page=${page}`;
    if (modifiedAfter) url += `&modified_after=${encodeURIComponent(modifiedAfter)}`;
    const orders = await fetchWooPage(url, wooAuth(site));
    ids.push(...orders.map((o) => String(o.id)));
    if (orders.length < 100) break;
  }
  return ids;
}

/** Marks orders as trashed (status 'trash' — not paid, so out of every metric). */
export async function markWooOrdersTrashed(
  supabase: SupabaseClient,
  siteId: string,
  wooIds: string[]
): Promise<number> {
  if (!wooIds.length) return 0;
  const { data } = await supabase
    .from("orders")
    .update({ status: "trash", updated_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("source", "woocommerce")
    .in("woo_order_id", wooIds)
    .neq("status", "trash")
    .select("id");
  return data?.length ?? 0;
}

export async function syncWooSite(
  supabase: SupabaseClient,
  site: WooSite,
  logType: "manual" | "cron" = "manual",
  after?: string, // ISO date — only fetch orders created after this date
  modifiedAfter?: string // ISO date — only orders changed since (status, refunds, …)
): Promise<WooSyncResult> {
  const auth = Buffer.from(
    `${site.consumer_key}:${site.consumer_secret}`
  ).toString("base64");

  const result: WooSyncResult = { synced: 0, failed: 0, complete: true, seenWooIds: new Set() };

  for (let page = 1; ; page++) {
    let url =
      `${site.url}/wp-json/wc/v3/orders` +
      `?per_page=100&page=${page}&orderby=date&order=asc`;
    if (after) url += `&after=${encodeURIComponent(after)}`;
    if (modifiedAfter) url += `&modified_after=${encodeURIComponent(modifiedAfter)}`;

    let orders: WooOrder[];
    try {
      orders = await fetchWooPage(url, auth);
    } catch (err) {
      result.complete = false;
      result.error = `Page ${page}: ${(err as Error).message}`;
      break;
    }

    if (!orders.length) break;

    for (const order of orders) {
      result.seenWooIds.add(String(order.id));
      if (await ingestWooOrder(supabase, site, order)) result.synced++;
      else result.failed++;
    }
  }

  const status = !result.complete
    ? result.synced > 0 ? "partial" : "error"
    : result.failed > 0 ? "partial" : "success";
  const message = [result.error, result.failed ? `${result.failed} orders failed` : ""]
    .filter(Boolean)
    .join("; ");
  await logSync(supabase, site.id, logType, status, result.synced, message || undefined);

  return result;
}
