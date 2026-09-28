import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncWooSite } from "@/lib/sync/sync-woo-site";
import { syncThinkificSite } from "@/lib/sync/sync-thinkific-site";
import { syncMetaAccount } from "@/lib/sync/sync-meta-account";

// Daily Vercel cron — safety net behind the webhooks:
//   • WooCommerce: re-pull orders created in the last WOO_LOOKBACK_DAYS, which
//     picks up missed webhooks and recent status changes without a full-history
//     pull (that would blow the function timeout).
//   • Thinkific: full sync (no date filter in its API client yet).
//   • Meta: last META_LOOKBACK_DAYS of spend — Meta revises recent days' numbers.
// Stripe is covered by its webhook + /api/cron/sync-subscriptions.
// Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
export const maxDuration = 300;

const WOO_LOOKBACK_DAYS = 3;
const META_LOOKBACK_DAYS = 7;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  const [sitesRes, accountsRes] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, platform, url, consumer_key, consumer_secret, subdomain, thinkific_api_key, default_margin_percent")
      .eq("is_active", true),
    supabase.from("ad_accounts").select("id, name").eq("is_active", true),
  ]);

  if (sitesRes.error || !sitesRes.data)
    return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });

  const sites = sitesRes.data;
  const accounts = accountsRes.data ?? [];
  const wooAfter = new Date(Date.now() - WOO_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [siteResults, metaResults] = await Promise.all([
    Promise.allSettled(
      sites.map((site) => {
        if (site.platform === "woocommerce")
          return syncWooSite(supabase, site, "cron", wooAfter).then((r) => {
            if (!r.complete && r.synced === 0) throw new Error(r.error);
            return r.synced;
          });
        if (site.platform === "thinkific") return syncThinkificSite(supabase, site, "cron");
        return Promise.resolve(0);
      })
    ),
    Promise.allSettled(accounts.map((a) => syncMetaAccount(a.id, META_LOOKBACK_DAYS))),
  ]);

  const summary = {
    sites: siteResults.map((r, i) => ({
      site: sites[i].name,
      platform: sites[i].platform,
      synced: r.status === "fulfilled" ? r.value : 0,
      error: r.status === "rejected" ? String(r.reason) : undefined,
    })),
    ads: metaResults.map((r, i) => ({
      account: accounts[i].name,
      rows: r.status === "fulfilled" ? r.value.rows : 0,
      error: r.status === "rejected" ? String(r.reason) : r.value.error,
    })),
  };

  console.log(`[cron] sync-all:`, JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
