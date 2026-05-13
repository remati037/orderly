import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncWooSite } from "@/lib/sync/sync-woo-site";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (force) {
    // Delete only orders within the date range being resynced (scoped delete)
    let selectQ = supabase.from("orders").select("id").eq("site_id", siteId);
    if (after) selectQ = selectQ.gte("created_at", after);

    const { data: orderIds } = await selectQ;
    if (orderIds && orderIds.length > 0) {
      const ids = orderIds.map((r) => r.id);
      await supabase.from("order_items").delete().in("order_id", ids);
      await supabase.from("orders").delete().in("id", ids);
    }
  }

  const synced = await syncWooSite(supabase, site, "manual", after ?? undefined);

  return NextResponse.json({ synced, site: site.name, force, after });
}
