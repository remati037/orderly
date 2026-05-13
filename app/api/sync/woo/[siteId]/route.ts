import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncWooSite } from "@/lib/sync/sync-woo-site";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const supabase = adminClient();

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

  const synced = await syncWooSite(supabase, site, "manual");

  return NextResponse.json({ synced, site: site.name });
}
