import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { hasMetaLiveToken } from "@/lib/auth/service-token";
import { syncMetaLive } from "@/lib/sync/sync-meta-live";
import { runMetaAlerts } from "@/lib/ads/alerts";

// Every 15 minutes from Supabase pg_cron (migration 033), since Vercel Hobby
// crons run once a day. `?backfill=7` or `30` loads past days once.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const supabase = adminClient();

  const cronSecret = process.env.CRON_SECRET;
  const authorized =
    (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) ||
    (await hasMetaLiveToken(supabase, request));
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const backfill = request.nextUrl.searchParams.get("backfill");
  const backfillDays = backfill === "7" || backfill === "30" ? (Number(backfill) as 7 | 30) : undefined;

  const { data: accounts, error } = await supabase.from("ad_accounts").select("id, name").eq("is_active", true);
  if (error) return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });

  // One account failing must not stop the others.
  const results = await Promise.all((accounts ?? []).map((a) => syncMetaLive(a.id, backfillDays)));
  const alerts = backfillDays
    ? null
    : await runMetaAlerts(supabase).catch((e) => ({ sent: 0, error: String(e) }));

  const summary = {
    accounts: results.map((r, i) => ({ account: accounts![i].name, rows: r.rows, error: r.error })),
    alerts,
  };
  console.log(`[cron] meta-live:`, JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
