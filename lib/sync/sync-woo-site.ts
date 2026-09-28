import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWooOrder, WooOrder } from "./normalize-woo-order";
import { upsertWooOrder, upsertCustomer, logSync } from "./db";

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

export async function syncWooSite(
  supabase: SupabaseClient,
  site: WooSite,
  logType: "manual" | "cron" = "manual",
  after?: string // ISO date — only fetch orders created after this date
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
      try {
        const normalized = await normalizeWooOrder(
          supabase,
          order,
          site.id,
          site.default_margin_percent ?? 100
        );
        const orderId = await upsertWooOrder(supabase, normalized);
        if (!orderId) {
          result.failed++;
          continue;
        }
        if (normalized.orderRow.customer_email) {
          await upsertCustomer(
            supabase,
            normalized.orderRow.customer_email,
            normalized.orderRow.customer_name,
            normalized.orderRow.customer_city
          );
        }
        result.synced++;
      } catch {
        result.failed++;
      }
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
