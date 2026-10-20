// Grants Circle access to buyers of a WooCommerce product.
//
// A paid order (processing / completed) whose line items match a rule in
// settings.circle_access creates the buyer in Circle and adds them to the rule's
// access group. circle_grants makes it idempotent per (order, group); failed
// grants are retried by the daily cron sweep.

import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_URL = "https://app.circle.so/api/admin/v2";

export interface CircleRule {
  site_id?: string;
  woo_product_id: number;
  access_group_id: number;
}

export interface CircleConfig {
  enabled: boolean;
  // Orders created before this instant are never granted (set when switching on,
  // so the sweep doesn't re-invite buyers who were added by hand).
  enabled_from: string | null;
  rules: CircleRule[];
}

const PAID = new Set(["processing", "completed"]);

export function isPaidStatus(status: string | null | undefined): boolean {
  return !!status && PAID.has(status);
}

// Access groups the order's line items entitle the buyer to.
export function matchAccessGroups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wooData: any,
  siteId: string,
  rules: CircleRule[]
): number[] {
  const productIds = new Set<number>(
    (wooData?.line_items ?? [])
      .map((i: { product_id?: number }) => Number(i.product_id))
      .filter((n: number) => Number.isFinite(n))
  );
  const groups = new Set<number>();
  for (const r of rules) {
    if (r.site_id && r.site_id !== siteId) continue;
    if (productIds.has(Number(r.woo_product_id))) groups.add(Number(r.access_group_id));
  }
  return [...groups];
}

export function parseCircleConfig(value: unknown): CircleConfig {
  const v = (value ?? {}) as Partial<CircleConfig>;
  return {
    enabled: v.enabled === true,
    enabled_from: typeof v.enabled_from === "string" ? v.enabled_from : null,
    rules: Array.isArray(v.rules) ? v.rules : [],
  };
}

// ── Circle Admin API v2 ───────────────────────────────────────────────────────

type Fetch = typeof fetch;

async function circleCall(f: Fetch, token: string, method: string, path: string, body?: unknown) {
  const res = await f(`${ADMIN_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// Creates the member if Circle doesn't know the email, then adds them to the
// access group. Throws with Circle's response on failure.
export async function grantCircleAccess(
  token: string,
  args: { email: string; name: string; accessGroupId: number },
  f: Fetch = fetch
): Promise<void> {
  const email = args.email.trim().toLowerCase();

  const found = await circleCall(f, token, "GET", `/community_members/search?email=${encodeURIComponent(email)}`);
  if (!found.ok && found.status !== 404) throw new Error(`Circle search ${found.status}: ${found.text.slice(0, 200)}`);

  if (!found.ok) {
    const created = await circleCall(f, token, "POST", "/community_members", {
      email,
      name: args.name || email,
      skip_invitation: false,
    });
    // 422 = someone created the member between search and create: carry on.
    if (!created.ok && created.status !== 422)
      throw new Error(`Circle create member ${created.status}: ${created.text.slice(0, 200)}`);
  }

  const added = await circleCall(f, token, "POST", `/access_groups/${args.accessGroupId}/community_members`, { email });
  // 422 on an existing membership is fine; anything else is a real failure.
  if (!added.ok && !(added.status === 422 && /already|exist/i.test(added.text)))
    throw new Error(`Circle add to group ${added.status}: ${added.text.slice(0, 200)}`);
}

// ── Orchestration ─────────────────────────────────────────────────────────────

export type GrantOutcome = "disabled" | "not-paid" | "no-match" | "too-old" | "no-token" | "no-email" | "done" | "partial";

async function loadConfig(supabase: SupabaseClient): Promise<CircleConfig> {
  const { data } = await supabase.from("settings").select("value").eq("key", "circle_access").maybeSingle();
  return parseCircleConfig(data?.value);
}

async function loadToken(supabase: SupabaseClient, siteId: string): Promise<string | null> {
  const { data: own } = await supabase.from("sites").select("circle_token").eq("id", siteId).single();
  if (own?.circle_token) return own.circle_token;
  const { data: any } = await supabase.from("sites").select("circle_token").not("circle_token", "is", null).limit(1);
  return any?.[0]?.circle_token ?? null;
}

export async function processOrderCircleAccess(
  supabase: SupabaseClient,
  orderId: string,
  opts: { config?: CircleConfig; f?: Fetch } = {}
): Promise<GrantOutcome> {
  const config = opts.config ?? (await loadConfig(supabase));
  if (!config.enabled || config.rules.length === 0) return "disabled";

  const { data: order } = await supabase
    .from("orders")
    .select("id, site_id, status, customer_email, customer_name, woo_data, source, created_at")
    .eq("id", orderId)
    .single();
  if (!order || order.source !== "woocommerce") return "no-match";
  if (!isPaidStatus(order.status)) return "not-paid";
  if (config.enabled_from && new Date(order.created_at) < new Date(config.enabled_from)) return "too-old";

  const groups = matchAccessGroups(order.woo_data, order.site_id, config.rules);
  if (groups.length === 0) return "no-match";
  if (!order.customer_email) return "no-email";

  const token = await loadToken(supabase, order.site_id);
  if (!token) {
    console.error(`[circle] no circle_token configured, order ${orderId} not granted`);
    return "no-token";
  }

  const { data: existing } = await supabase
    .from("circle_grants")
    .select("access_group_id, status, attempts")
    .eq("order_id", orderId);
  const byGroup = new Map((existing ?? []).map((g) => [Number(g.access_group_id), g]));

  let failed = false;
  for (const groupId of groups) {
    const prev = byGroup.get(groupId);
    if (prev?.status === "ok") continue;
    const now = new Date().toISOString();
    try {
      await grantCircleAccess(
        token,
        { email: order.customer_email, name: order.customer_name ?? "", accessGroupId: groupId },
        opts.f
      );
      await supabase.from("circle_grants").upsert(
        {
          order_id: orderId, email: order.customer_email, access_group_id: groupId,
          status: "ok", attempts: (prev?.attempts ?? 0) + 1, last_error: null, granted_at: now, updated_at: now,
        },
        { onConflict: "order_id,access_group_id" }
      );
      console.log(`[circle] granted group ${groupId} to ${order.customer_email} (order ${orderId})`);
    } catch (err) {
      failed = true;
      console.error(`[circle] grant failed for order ${orderId}:`, err);
      await supabase.from("circle_grants").upsert(
        {
          order_id: orderId, email: order.customer_email, access_group_id: groupId,
          status: "error", attempts: (prev?.attempts ?? 0) + 1, last_error: String(err).slice(0, 500), updated_at: now,
        },
        { onConflict: "order_id,access_group_id" }
      );
    }
  }
  return failed ? "partial" : "done";
}

// Daily safety net: paid Woo orders of the last `days` days that are missing a
// successful grant (missed webhook, Circle outage, token fixed later).
export async function sweepCircleAccess(
  supabase: SupabaseClient,
  days = 7
): Promise<{ checked: number; granted: number; failed: number }> {
  const config = await loadConfig(supabase);
  const stats = { checked: 0, granted: 0, failed: 0 };
  if (!config.enabled || config.rules.length === 0) return stats;

  let since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (config.enabled_from && config.enabled_from > since) since = config.enabled_from;
  const { data: orders } = await supabase
    .from("orders")
    .select("id, site_id, woo_data")
    .eq("source", "woocommerce")
    .in("status", [...PAID])
    .gte("created_at", since);

  for (const o of orders ?? []) {
    if (matchAccessGroups(o.woo_data, o.site_id, config.rules).length === 0) continue;
    stats.checked++;
    const r = await processOrderCircleAccess(supabase, o.id, { config });
    if (r === "done") stats.granted++;
    else if (r === "partial") stats.failed++;
  }
  return stats;
}
