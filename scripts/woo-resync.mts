// Repair specific WooCommerce orders in Orderly, through the same code as the
// webhook (lib/sync/sync-woo-site.ts): re-pull orders by id, and mark orders
// that were deleted in Woo as trashed.
//
//   npm run woo:resync -- --site "Nemanja Antic" --ids 6513,6514,6862 --trash 7094,7095
//       dry run: Woo's view vs Orderly's for each order
//   ... --yes   write it
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local. Site
// keys are read from the database and never printed.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { markWooOrdersTrashed, syncWooOrdersById } from "../lib/sync/sync-woo-site.ts";

const { values: a } = parseArgs({
  options: {
    site: { type: "string" },
    ids: { type: "string", default: "" },
    trash: { type: "string", default: "" },
    yes: { type: "boolean", default: false },
  },
});
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const ids = list(a.ids!);
const trash = list(a.trash!);
if (!a.site || (!ids.length && !trash.length)) {
  console.error('Usage: npm run woo:resync -- --site "<name>" [--ids 1,2] [--trash 3,4] [--yes]');
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: site, error } = await supabase
  .from("sites")
  .select("id, name, url, consumer_key, consumer_secret, default_margin_percent")
  .eq("platform", "woocommerce")
  .ilike("name", a.site)
  .single();
if (error || !site) {
  console.error(`Site "${a.site}" not found`);
  process.exit(1);
}

const auth = Buffer.from(`${site.consumer_key}:${site.consumer_secret}`).toString("base64");
const rows = [];
for (const id of [...ids, ...trash]) {
  const res = await fetch(`${site.url.replace(/\/$/, "")}/wp-json/wc/v3/orders/${id}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const woo = res.ok ? await res.json() : null;
  const { data: mine } = await supabase
    .from("orders")
    .select("status, total")
    .eq("site_id", site.id)
    .eq("woo_order_id", id)
    .maybeSingle();
  rows.push({
    porudzbina: id,
    radnja: trash.includes(id) ? "označi kao obrisanu" : "povuci iz Woo",
    woo: woo ? `${woo.status} ${woo.total}` : `HTTP ${res.status}`,
    orderly: mine ? `${mine.status} ${mine.total}` : "nema",
  });
}
console.table(rows);

if (!a.yes) {
  console.log("Dry run. Za upis dodaj --yes");
  process.exit(0);
}

const synced = ids.length ? await syncWooOrdersById(supabase, site, ids) : { synced: 0, failed: 0, missing: [] };
const trashed = await markWooOrdersTrashed(supabase, site.id, trash);
console.log(`Povučeno: ${synced.synced}, neuspelo: ${synced.failed}, nema u Woo: ${synced.missing.join(",") || "—"}; označeno obrisano: ${trashed}`);
