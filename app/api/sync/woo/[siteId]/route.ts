import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { syncWooSite } from "@/lib/sync/sync-woo-site";
import { fetchAll } from "@/lib/supabase/fetch-all";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { siteId } = await params;
  const supabase = adminClient();

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;
  const after: string | null = body?.after ?? null; // ISO date string for date-range sync

  const { data: site, error } = await supabase
    .from("sites")
    .select("id, name, url, consumer_key, consumer_secret, default_margin_percent, platform")
    .eq("id", siteId)
    .single();

  if (error || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (site.platform !== "woocommerce") {
    return NextResponse.json({ error: "Not a WooCommerce site" }, { status: 400 });
  }

  // Upsert first — it's idempotent, so nothing is ever deleted up front.
  const result = await syncWooSite(supabase, site, "manual", after ?? undefined);

  // "force" additionally removes local orders in the range that WooCommerce no
  // longer returns (deleted in the shop) — but only after a complete pull, so
  // an API hiccup can't wipe orders (and their recovery tasks) by mistake.
  let removed = 0;
  if (force && result.complete) {
    const { data: local } = await fetchAll(() => {
      let q = supabase.from("orders").select("id, woo_order_id").eq("site_id", siteId).order("id");
      // Skip the first day of the range: WooCommerce may apply `after` in the
      // shop's local timezone, so orders right at the boundary might not have
      // been returned even though they still exist.
      if (after) q = q.gte("created_at", new Date(new Date(after).getTime() + 86_400_000).toISOString());
      return q;
    });
    const stale = local.filter((o) => !result.seenWooIds.has(String(o.woo_order_id))).map((o) => o.id);
    for (let i = 0; i < stale.length; i += 200) {
      await supabase.from("orders").delete().in("id", stale.slice(i, i + 200));
    }
    removed = stale.length;
  }

  if (!result.complete && result.synced === 0)
    return NextResponse.json({ error: result.error ?? "Sync failed", site: site.name }, { status: 502 });

  return NextResponse.json({
    synced: result.synced,
    failed: result.failed,
    removed,
    complete: result.complete,
    error: result.error,
    site: site.name,
    force,
    after,
  });
}
