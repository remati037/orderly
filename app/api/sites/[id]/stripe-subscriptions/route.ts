import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { fetchSubscriptionsPage, upsertSubscription } from "@/lib/sync/sync-stripe-subscriptions";

// Imports Stripe subscriptions (all statuses) into the subscriptions table.
// One page per call; the client loops on next_cursor. Idempotent via
// stripe_subscription_id.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { id: siteId } = await params;
  const body = await request.json().catch(() => ({}));
  const startingAfter: string | null = body?.starting_after ?? null;

  const supabase = adminClient();

  const [{ data: site }, fx] = await Promise.all([
    supabase.from("sites").select("id, platform, consumer_key").eq("id", siteId).single(),
    loadFxSettings(supabase),
  ]);

  if (!site || site.platform !== "stripe")
    return NextResponse.json({ error: "Nije Stripe sajt" }, { status: 400 });
  if (!site.consumer_key)
    return NextResponse.json({ error: "Nedostaje Stripe secret key" }, { status: 400 });

  const res = await fetchSubscriptionsPage(site.consumer_key, startingAfter);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });

  let imported = 0;
  let firstError: string | undefined;
  for (const sub of res.subs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await upsertSubscription(supabase, sub as any, siteId, fx.rates);
    if (r.ok) imported++;
    else if (!firstError) firstError = r.error;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextCursor = res.subs.length ? (res.subs[res.subs.length - 1] as any).id : null;
  return NextResponse.json({
    imported,
    scanned: res.subs.length,
    error: imported === 0 && firstError ? firstError : undefined,
    next_cursor: res.hasMore ? nextCursor : null,
    done: !res.hasMore,
  });
}
