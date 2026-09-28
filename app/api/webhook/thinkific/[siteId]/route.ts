import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { upsertCustomer, upsertThinkificSubscription, logSync } from "@/lib/sync/db";
import { verifyHmacSignature } from "@/lib/sync/hmac-signature";

// ── types ──────────────────────────────────────────────────────────────────────

interface ThinkificUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

interface ThinkificPayload {
  id: number;
  status?: string;
  amount_dollars?: number;
  payment_type?: string;
  user: ThinkificUser;
  product_name?: string;
  course_name?: string;
}

interface ThinkificWebhook {
  resource: string;
  action: string;
  payload: ThinkificPayload;
}

// ── handler ────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const supabase = adminClient();

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-thinkific-hmac-sha256");

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, name, platform, default_margin_percent, thinkific_api_key")
      .eq("id", siteId)
      .single();

    if (siteError || !site || site.platform !== "thinkific") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!verifyHmacSignature(rawBody, signature, site.thinkific_api_key, "hex")) {
      console.error(
        `[thinkific-webhook] ${signature ? "Signature mismatch" : "Missing signature"} for site "${site.name}" — rejecting payload`
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body: ThinkificWebhook = JSON.parse(rawBody);
    const { resource, action, payload } = body;

    const now = new Date().toISOString();
    const thinkificOrderId = payload.id.toString();
    const customerEmail = payload.user.email;
    const customerName =
      `${payload.user.first_name} ${payload.user.last_name}`.trim();
    const marginPercent = site.default_margin_percent ?? 100;

    // ── order.updated ─────────────────────────────────────────────────────────
    if (resource === "order" && action === "updated") {
      await supabase
        .from("orders")
        .update({
          status: payload.status === "Complete" ? "completed" : "pending",
          updated_at: now,
        })
        .eq("site_id", siteId)
        .eq("woo_order_id", thinkificOrderId);

      await logSync(supabase, siteId, "webhook", "success", 1);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ── order.created ─────────────────────────────────────────────────────────
    if (resource === "order" && action === "created") {
      const total = payload.amount_dollars ?? 0;
      const paymentType =
        payload.payment_type === "subscription" ? "subscription" : "one-time";
      const productName = payload.product_name ?? "";

      const { data: row, error: orderError } = await supabase
        .from("orders")
        .upsert(
          {
            site_id: siteId,
            woo_order_id: thinkificOrderId,
            source: "thinkific",
            status: payload.status === "Complete" ? "completed" : "pending",
            total,
            net_profit: total * (marginPercent / 100),
            currency: "USD",
            customer_name: customerName,
            customer_email: customerEmail,
            product_type: "digital",
            payment_type: paymentType,
            woo_data: payload,
            updated_at: now,
          },
          { onConflict: "site_id,woo_order_id" }
        )
        .select("id")
        .single();

      if (orderError || !row) {
        await logSync(supabase, siteId, "webhook", "error", 0, orderError?.message);
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      await supabase.from("order_items").delete().eq("order_id", row.id);
      await supabase.from("order_items").insert({
        order_id: row.id,
        product_name: productName,
        product_type: "digital",
        quantity: 1,
        price: total,
        cost: 0,
      });

      if (customerEmail) {
        await upsertCustomer(supabase, customerEmail, customerName);
      }

      if (paymentType === "subscription" && customerEmail) {
        await upsertThinkificSubscription(supabase, siteId, customerEmail, productName, total, now);
      }

      await logSync(supabase, siteId, "webhook", "success", 1);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ── enrollment.created ────────────────────────────────────────────────────
    if (resource === "enrollment" && action === "created") {
      const productName = payload.course_name ?? payload.product_name ?? "";

      const { data: row, error: orderError } = await supabase
        .from("orders")
        .upsert(
          {
            site_id: siteId,
            woo_order_id: thinkificOrderId,
            source: "thinkific",
            status: "completed",
            total: 0,
            net_profit: 0,
            currency: "USD",
            customer_name: customerName,
            customer_email: customerEmail,
            product_type: "digital",
            payment_type: "free_enrollment",
            woo_data: payload,
            updated_at: now,
          },
          { onConflict: "site_id,woo_order_id" }
        )
        .select("id")
        .single();

      if (orderError || !row) {
        await logSync(supabase, siteId, "webhook", "error", 0, orderError?.message);
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      await supabase.from("order_items").delete().eq("order_id", row.id);
      await supabase.from("order_items").insert({
        order_id: row.id,
        product_name: productName,
        product_type: "digital",
        quantity: 1,
        price: 0,
        cost: 0,
      });

      if (customerEmail) {
        await upsertCustomer(supabase, customerEmail, customerName);
      }

      await logSync(supabase, siteId, "webhook", "success", 1);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Unknown event — ack and ignore
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Thinkific webhook error:", err);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
