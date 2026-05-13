import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncWooSite } from "@/lib/sync/sync-woo-site";
import { syncThinkificSite } from "@/lib/sync/sync-thinkific-site";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, name, platform, url, consumer_key, consumer_secret, subdomain, thinkific_api_key, default_margin_percent")
    .eq("is_active", true);

  if (error || !sites) {
    return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });
  }

  const results = await Promise.allSettled(
    sites.map((site) => {
      if (site.platform === "woocommerce") {
        return syncWooSite(supabase, site, "cron");
      }
      if (site.platform === "thinkific") {
        return syncThinkificSite(supabase, site, "cron");
      }
      return Promise.resolve(0);
    })
  );

  const summary = results.map((result, i) => ({
    site: sites[i].name,
    platform: sites[i].platform,
    status: result.status,
    synced: result.status === "fulfilled" ? result.value : 0,
    error: result.status === "rejected" ? String(result.reason) : undefined,
  }));

  const totalSynced = summary.reduce((sum, s) => sum + s.synced, 0);

  return NextResponse.json({ totalSynced, sites: summary });
}
