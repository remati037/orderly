import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/sync/stripe-signature";
import {
  normalizeStripeEvent,
  stripeProductName,
  stripeAmount,
} from "@/lib/sync/normalize-stripe-event";
import { upsertCustomer, logSync } from "@/lib/sync/db";

// Fetch the real processor fee for a charge/invoice, in the order currency.
// Returns null if it can't be resolved (caller falls back to the 5% estimate).
async function fetchProcessorFee(
  obj: { balance_transaction?: string; charge?: string; currency?: string },
  secretKey: string
): Promise<number | null> {
  if (!secretKey) return null;
  const currency = String(obj.currency ?? "usd");

  async function get(url: string) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
    return res.ok ? res.json() : null;
  }

  try {
    let btId = obj.balance_transaction;

    // Invoices carry the fee on their charge, not on the invoice itself.
    if (!btId && obj.charge) {
      const charge = await get(`https://api.stripe.com/v1/charges/${obj.charge}`);
      btId = charge?.balance_transaction;
    }
    if (!btId) return null;

    const bt = await get(`https://api.stripe.com/v1/balance_transactions/${btId}`);
    if (bt?.fee == null) return null;

    return stripeAmount(Number(bt.fee), currency);
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const supabase = adminClient();

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const { data: site } = await supabase
    .from("sites")
    .select("id, name, platform, consumer_key, consumer_secret, default_margin_percent")
    .eq("id", siteId)
    .single();

  // Unknown or wrong-type site: 200 so Stripe stops retrying.
  if (!site || site.platform !== "stripe") {
    console.error(`[stripe-webhook] site not found or not stripe: ${siteId}`);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Signature failure is the one case we answer non-2xx.
  if (!verifyStripeSignature(rawBody, signature, site.consumer_secret ?? "")) {
    console.error(`[stripe-webhook] bad signature for "${site.name}"`);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ev = event as any;
  const obj = ev.data?.object ?? {};

  // Only pull the fee for a successful charge.
  const fee =
    ev.type === "charge.succeeded"
      ? await fetchProcessorFee(obj, site.consumer_key ?? "")
      : null;

  const normalized = normalizeStripeEvent(
    ev,
    siteId,
    site.default_margin_percent ?? 100,
    fee
  );

  // Event type we don't track — acknowledge and move on.
  if (!normalized) return NextResponse.json({ ok: true }, { status: 200 });

  const { data: row, error } = await supabase
    .from("orders")
    .upsert({ ...normalized, payment_method: "stripe" }, { onConflict: "site_id,woo_order_id" })
    .select("id")
    .single();

  if (error || !row) {
    console.error(`[stripe-webhook] upsert failed:`, error?.message);
    await logSync(supabase, siteId, "webhook", "error", 0, error?.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // One order line — Stripe charges don't expose per-product line items here.
  await supabase.from("order_items").delete().eq("order_id", row.id);
  await supabase.from("order_items").insert({
    order_id: row.id,
    product_name: stripeProductName(obj, site.name),
    product_type: normalized.product_type,
    quantity: 1,
    price: normalized.total,
  });

  if (normalized.customer_email) {
    await upsertCustomer(
      supabase,
      normalized.customer_email,
      normalized.customer_name ?? "",
      normalized.status === "completed" ? normalized.total : 0,
      normalized.customer_city ?? undefined
    );
  }

  await logSync(supabase, siteId, "webhook", "success", 1);

  console.log(`[stripe-webhook] "${site.name}" ${ev.type} → ${normalized.status} (${normalized.total} ${normalized.currency})`);
  return NextResponse.json({ ok: true }, { status: 200 });
}
