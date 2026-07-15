import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { stripeAmount } from "@/lib/sync/normalize-stripe-event";

// Stripe subscription.status → our enum (active | trial | paused | cancelled).
function mapSubStatus(status: string): string {
  switch (status) {
    case "active":
    case "past_due":   return "active";   // still subscribed, payment retrying
    case "trialing":   return "trial";
    case "paused":     return "paused";
    default:           return "cancelled"; // canceled, unpaid, incomplete*, …
  }
}

// Monthly-normalized amount in the subscription's own currency.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function monthlyAmount(item: any): { amount: number; currency: string } {
  const price = item?.price ?? item?.plan ?? {};
  const currency = String(price.currency ?? "eur").toUpperCase();
  const unit = stripeAmount(Number(price.unit_amount ?? 0), currency);
  const qty = Number(item?.quantity ?? 1);
  const gross = unit * qty;

  const rec = price.recurring ?? price; // `plan` puts interval at the top level
  const interval = rec.interval ?? "month";
  const count = Number(rec.interval_count ?? 1) || 1;

  const perMonth =
    interval === "year" ? gross / (12 * count)
    : interval === "week" ? (gross * 52) / 12 / count
    : interval === "day" ? (gross * 365) / 12 / count
    : gross / count; // month
  return { amount: perMonth, currency };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function customerIdFor(supabase: any, cust: any): Promise<string | null> {
  const email = (cust?.email ?? "").toLowerCase();
  if (!email) return null;

  const { data: existing } = await supabase
    .from("customers").select("id").eq("email", email).maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("customers")
    .insert({ email, name: cust?.name ?? null })
    .select("id").single();
  return created?.id ?? null;
}

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

  const url = new URL("https://api.stripe.com/v1/subscriptions");
  url.searchParams.set("status", "all");
  url.searchParams.set("limit", "100");
  url.searchParams.append("expand[]", "data.customer");
  if (startingAfter) url.searchParams.set("starting_after", startingAfter);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${site.consumer_key}` },
  });
  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Stripe: ${msg.slice(0, 200)}` }, { status: 502 });
  }

  const page = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs: any[] = page.data ?? [];

  let imported = 0;
  let firstError: string | null = null;
  for (const sub of subs) {
    const item = sub.items?.data?.[0];
    const { amount, currency } = monthlyAmount(item);
    const mrrBase = Math.round(toBase(amount, currency, fx.rates) * 100) / 100;

    const row = {
      stripe_subscription_id: sub.id,
      site_id: siteId,
      customer_id: await customerIdFor(supabase, sub.customer),
      product_name:
        item?.price?.nickname || item?.plan?.nickname || sub.description || "Pretplata",
      mrr: mrrBase,
      status: mapSubStatus(sub.status),
      started_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString() : null,
      cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      next_billing_at: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
    };

    const { error } = await supabase
      .from("subscriptions")
      .upsert(row, { onConflict: "stripe_subscription_id" });
    if (error) {
      if (!firstError) firstError = error.message;
    } else {
      imported++;
    }
  }

  const nextCursor = subs.length ? subs[subs.length - 1].id : null;
  return NextResponse.json({
    imported,
    scanned: subs.length,
    // Surfaced when writes fail (e.g. migration 012 not run → no
    // stripe_subscription_id column for the ON CONFLICT target).
    error: imported === 0 && firstError ? firstError : undefined,
    next_cursor: page.has_more ? nextCursor : null,
    done: !page.has_more,
  });
}
