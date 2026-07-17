import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { stripeAmount } from "@/lib/sync/normalize-stripe-event";

type Supa = ReturnType<typeof adminClient>;

// Stripe subscription.status → our enum (active | trial | paused | cancelled).
export function mapSubStatus(status: string): string {
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
export function monthlyAmount(item: any): { amount: number; currency: string } {
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
export async function customerIdFor(supabase: Supa, cust: any): Promise<string | null> {
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

// Fetch one page of subscriptions (all statuses) from Stripe.
export async function fetchSubscriptionsPage(
  secretKey: string,
  startingAfter: string | null
): Promise<{ ok: boolean; subs: unknown[]; hasMore: boolean; error?: string }> {
  const url = new URL("https://api.stripe.com/v1/subscriptions");
  url.searchParams.set("status", "all");
  url.searchParams.set("limit", "100");
  url.searchParams.append("expand[]", "data.customer");
  if (startingAfter) url.searchParams.set("starting_after", startingAfter);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${secretKey}` } });
  if (!res.ok) {
    const msg = await res.text();
    return { ok: false, subs: [], hasMore: false, error: `Stripe: ${msg.slice(0, 200)}` };
  }
  const page = await res.json();
  return { ok: true, subs: page.data ?? [], hasMore: !!page.has_more };
}

// Upsert one Stripe subscription into the subscriptions table (idempotent).
export async function upsertSubscription(
  supabase: Supa,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sub: any,
  siteId: string,
  rates: Record<string, number>
): Promise<{ ok: boolean; error?: string }> {
  const item = sub.items?.data?.[0];
  const { amount, currency } = monthlyAmount(item);
  const mrrBase = Math.round(toBase(amount, currency, rates) * 100) / 100;

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
  return { ok: !error, error: error?.message };
}

// Full re-sync of every Stripe subscription for one site (loops all pages).
export async function syncSiteSubscriptions(
  supabase: Supa,
  site: { id: string; consumer_key: string | null },
  rates: Record<string, number>
): Promise<{ imported: number; error?: string }> {
  if (!site.consumer_key) return { imported: 0, error: "Nedostaje Stripe secret key" };

  let imported = 0;
  let cursor: string | null = null;
  let firstError: string | undefined;

  for (let page = 0; page < 200; page++) {
    const res = await fetchSubscriptionsPage(site.consumer_key, cursor);
    if (!res.ok) return { imported, error: res.error };

    for (const sub of res.subs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await upsertSubscription(supabase, sub as any, site.id, rates);
      if (r.ok) imported++;
      else if (!firstError) firstError = r.error;
    }

    if (!res.hasMore || !res.subs.length) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor = (res.subs[res.subs.length - 1] as any).id;
  }

  return { imported, error: imported === 0 ? firstError : undefined };
}

// Re-sync subscriptions for every connected Stripe site. Used by the daily cron.
export async function syncAllStripeSubscriptions(): Promise<{
  sites: number;
  imported: number;
  errors: string[];
}> {
  const supabase = adminClient();
  const [{ data: sites }, fx] = await Promise.all([
    supabase.from("sites").select("id, consumer_key").eq("platform", "stripe"),
    loadFxSettings(supabase),
  ]);

  let imported = 0;
  const errors: string[] = [];
  for (const site of sites ?? []) {
    const r = await syncSiteSubscriptions(supabase, site, fx.rates);
    imported += r.imported;
    if (r.error) errors.push(`${site.id}: ${r.error}`);
  }

  return { sites: (sites ?? []).length, imported, errors };
}
