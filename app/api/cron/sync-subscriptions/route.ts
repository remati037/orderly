import { NextRequest, NextResponse } from "next/server";
import { syncAllStripeSubscriptions } from "@/lib/sync/sync-stripe-subscriptions";

// Daily Vercel cron: re-sync every Stripe site's subscriptions so statuses,
// MRR and churn stay current (the charge webhook doesn't cover subscription
// lifecycle). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncAllStripeSubscriptions();
  console.log(`[cron] subscriptions synced:`, JSON.stringify(result));
  return NextResponse.json({ ok: true, ...result });
}
