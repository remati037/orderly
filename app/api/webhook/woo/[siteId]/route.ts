import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminClient } from "@/lib/supabase/admin";
import { normalizeWooOrder } from "@/lib/sync/normalize-woo-order";
import { upsertWooOrder, upsertCustomer, logSync } from "@/lib/sync/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  // adminClient() uses SUPABASE_SERVICE_ROLE_KEY — required for webhook routes (no auth user)
  const supabase = adminClient();

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-wc-webhook-signature");

    // ── 1. Fetch site ──────────────────────────────────────────────────────────
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("*")
      .eq("id", siteId)
      .single();

    if (siteError || !site) {
      console.error(`[woo-webhook] Site not found: siteId=${siteId}`, siteError?.message);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    console.log(`[woo-webhook] Site resolved: "${site.name}" (${siteId})`);

    // ── 2. Verify signature ────────────────────────────────────────────────────
    if (signature && site.consumer_secret) {
      const expected = crypto
        .createHmac("sha256", site.consumer_secret)
        .update(rawBody)
        .digest("base64");
      if (expected !== signature) {
        console.error(`[woo-webhook] Signature mismatch for site "${site.name}" — rejecting payload`);
        return NextResponse.json({ ok: true }, { status: 200 });
      }
    }

    // ── 3. Parse payload ───────────────────────────────────────────────────────
    const order = JSON.parse(rawBody);
    console.log(
      `[woo-webhook] Payload parsed: woo_order_id=${order.id}, status="${order.status}", total=${order.total}, customer="${order.billing?.email}"`
    );

    const normalized = await normalizeWooOrder(
      supabase,
      order,
      siteId,
      site.default_margin_percent ?? 100
    );

    // ── 4. Upsert order ────────────────────────────────────────────────────────
    const orderId = await upsertWooOrder(supabase, normalized);

    if (!orderId) {
      console.error(`[woo-webhook] Order upsert failed: woo_order_id=${order.id}, site="${site.name}"`);
      await logSync(supabase, siteId, "webhook", "error", 0, "Order upsert failed");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    console.log(`[woo-webhook] Order upserted: internal_id=${orderId}, woo_order_id=${order.id}, net_profit=${normalized.orderRow.net_profit}`);

    // ── 5. Upsert customer ─────────────────────────────────────────────────────
    if (normalized.orderRow.customer_email) {
      await upsertCustomer(
        supabase,
        normalized.orderRow.customer_email,
        normalized.orderRow.customer_name,
        normalized.orderRow.total,
        normalized.orderRow.customer_city
      );
    }

    await logSync(supabase, siteId, "webhook", "success", 1);
    console.log(`[woo-webhook] Done — woo_order_id=${order.id} processed successfully`);
  } catch (err) {
    console.error("[woo-webhook] Unhandled error:", err);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
