import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { normalizeWooOrder } from "@/lib/sync/normalize-woo-order";
import { upsertWooOrder, upsertCustomer, logSync } from "@/lib/sync/db";
import { verifyHmacSignature } from "@/lib/sync/hmac-signature";

// Orders that are not created by a shop platform: a customer chose to pay by bank
// transfer / IPS QR on the storefront and the storefront posts the order here as
// "on-hold". The recovery trigger then opens a card on the Naplata board.
//
// Payload is the WooCommerce order shape (so it reuses normalizeWooOrder), signed with
// HMAC-SHA256 (base64) in the X-WC-Webhook-Signature header using MANUAL_WEBHOOK_SECRET,
// a secret of its own — NOT the site's Stripe / WooCommerce secret.
//
// Unlike the Woo webhook this answers with real error codes (the caller is our own
// code, and it logs failures). Accepted statuses: on-hold (waiting for a bank / QR
// payment), processing and completed (paid, e.g. a card payment confirmed by Stripe).
// The same order id can be sent again to move it forward, but never backwards: an order
// already paid or cancelled is not reset to on-hold by a late or repeated delivery.
const ALLOWED = ["on-hold", "processing", "completed"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const rawBody = await request.text();

  if (
    !verifyHmacSignature(
      rawBody,
      request.headers.get("x-wc-webhook-signature"),
      process.env.MANUAL_WEBHOOK_SECRET,
      "base64"
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabase = adminClient();

  try {
    const { data: site } = await supabase
      .from("sites")
      .select("id, name, default_margin_percent")
      .eq("id", siteId)
      .maybeSingle();
    if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404 });

    const order = JSON.parse(rawBody);
    if (
      !ALLOWED.includes(order?.status) ||
      order.id == null ||
      !order.billing?.email ||
      !order.line_items?.length
    ) {
      return NextResponse.json(
        { error: `Expected status ${ALLOWED.join("|")} with id, billing.email and line_items` },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("orders")
      .select("status")
      .eq("site_id", siteId)
      .eq("woo_order_id", String(order.id))
      .maybeSingle();
    if (existing && order.status === "on-hold" && existing.status !== "on-hold") {
      return NextResponse.json({ ok: true, unchanged: existing.status });
    }

    const normalized = await normalizeWooOrder(supabase, order, siteId, site.default_margin_percent ?? 100);
    const orderId = await upsertWooOrder(supabase, normalized);
    if (!orderId) {
      await logSync(supabase, siteId, "webhook", "error", 0, "Manual order upsert failed");
      return NextResponse.json({ error: "Order upsert failed" }, { status: 500 });
    }

    await upsertCustomer(
      supabase,
      normalized.orderRow.customer_email,
      normalized.orderRow.customer_name,
      normalized.orderRow.customer_city
    );
    await logSync(supabase, siteId, "webhook", "success", 1);
    console.log(`[manual-webhook] "${site.name}" order ${order.id} stored as ${order.status}`);
    return NextResponse.json({ ok: true, id: orderId });
  } catch (err) {
    console.error("[manual-webhook] Unhandled error:", err);
    await logSync(supabase, siteId, "webhook", "error", 0, String(err)).catch(() => {});
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
