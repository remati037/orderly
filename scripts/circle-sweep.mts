// Grant Circle access for paid Woo orders that don't have it yet, through the
// same code as the daily cron (sweepCircleAccess in lib/circle/access.ts) but
// over a window you choose, e.g. after adding a rule for a new product.
//
//   npm run circle:sweep -- --days 14          dry run: which orders/groups would be granted
//   npm run circle:sweep -- --days 14 --yes    grant them (Circle sends new members an invitation)
//
// Never goes back before settings.circle_access.enabled_from. Needs
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { isPaidStatus, matchAccessGroups, parseCircleConfig, sweepCircleAccess } from "../lib/circle/access.ts";

const { values: a } = parseArgs({
  options: { days: { type: "string", default: "7" }, yes: { type: "boolean", default: false } },
});
const days = Number(a.days);
if (!Number.isFinite(days) || days <= 0) {
  console.error("Usage: npm run circle:sweep -- --days 14 [--yes]");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: cfgRow } = await supabase.from("settings").select("value").eq("key", "circle_access").maybeSingle();
const config = parseCircleConfig(cfgRow?.value);
if (!config.enabled) {
  console.log("Circle access is disabled in settings.circle_access.");
  process.exit(0);
}

let since = new Date(Date.now() - days * 86_400_000).toISOString();
if (config.enabled_from && config.enabled_from > since) since = config.enabled_from;

const { data: orders, error } = await supabase
  .from("orders")
  .select("id, woo_order_id, site_id, status, created_at, customer_email, woo_data, circle_grants(access_group_id, status)")
  .eq("source", "woocommerce")
  .gte("created_at", since)
  .order("created_at");
if (error) throw error;

let todo = 0;
for (const o of orders ?? []) {
  if (!isPaidStatus(o.status)) continue;
  const ok = new Set(
    (o.circle_grants as { access_group_id: number; status: string }[])
      .filter((g) => g.status === "ok")
      .map((g) => Number(g.access_group_id))
  );
  const missing = matchAccessGroups(o.woo_data, o.site_id, config.rules).filter((g) => !ok.has(g));
  if (!missing.length) continue;
  todo++;
  const domain = (o.customer_email ?? "").split("@")[1] ?? "(no email)";
  console.log(`#${o.woo_order_id}  ${o.created_at.slice(0, 10)}  groups ${missing.join(", ")}  @${domain}`);
}
console.log(`\n${todo} order(s) without full Circle access since ${since.slice(0, 10)}.`);

if (!a.yes) {
  console.log("Dry run. Add --yes to grant.");
  process.exit(0);
}
const stats = await sweepCircleAccess(supabase, days);
console.log("Sweep:", stats);
