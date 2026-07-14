import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import {
  normalizeStripeEvent,
  stripeProductName,
  stripeAmount,
} from "@/lib/sync/normalize-stripe-event";
import { upsertCustomer } from "@/lib/sync/db";

// Imports historical *successful* charges from Stripe into orders. Runs one
// page per call (Vercel timeout); the client loops on `next_cursor` until done.
// Idempotent: upsert on (site_id, woo_order_id) so re-running never duplicates.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { id: siteId } = await params;
  const body = await request.json().catch(() => ({}));
  const startingAfter: string | null = body?.starting_after ?? null;
  const pageSize = Math.min(100, Math.max(10, Number(body?.limit ?? 100)));

  const supabase = adminClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id, name, platform, consumer_key, default_margin_percent")
    .eq("id", siteId)
    .single();

  if (!site || site.platform !== "stripe")
    return NextResponse.json({ error: "Nije Stripe sajt" }, { status: 400 });
  if (!site.consumer_key)
    return NextResponse.json({ error: "Nedostaje Stripe secret key" }, { status: 400 });

  // Expand the fee inline so we don't make a second call per charge.
  const url = new URL("https://api.stripe.com/v1/charges");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.append("expand[]", "data.balance_transaction");
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
  const charges: any[] = page.data ?? [];

  let imported = 0;

  for (const charge of charges) {
    if (charge.status !== "succeeded" || charge.refunded) continue;

    const bt = charge.balance_transaction;
    const fee =
      bt && typeof bt === "object" && bt.fee != null
        ? stripeAmount(Number(bt.fee), String(charge.currency))
        : null;

    const normalized = normalizeStripeEvent(
      { type: "charge.succeeded", data: { object: charge }, created: charge.created },
      siteId,
      site.default_margin_percent ?? 100,
      fee
    );
    if (!normalized) continue;

    const { data: row, error } = await supabase
      .from("orders")
      .upsert({ ...normalized, payment_method: "stripe" }, { onConflict: "site_id,woo_order_id" })
      .select("id")
      .single();

    if (error || !row) continue;

    await supabase.from("order_items").delete().eq("order_id", row.id);
    await supabase.from("order_items").insert({
      order_id: row.id,
      product_name: stripeProductName(charge, site.name),
      product_type: normalized.product_type,
      quantity: 1,
      price: normalized.total,
    });

    if (normalized.customer_email) {
      await upsertCustomer(
        supabase,
        normalized.customer_email,
        normalized.customer_name ?? "",
        normalized.total,
        normalized.customer_city ?? undefined
      );
    }

    imported++;
  }

  const nextCursor = charges.length ? charges[charges.length - 1].id : null;

  return NextResponse.json({
    imported,
    scanned: charges.length,
    next_cursor: page.has_more ? nextCursor : null,
    done: !page.has_more,
  });
}
