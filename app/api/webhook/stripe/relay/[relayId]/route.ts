import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { fetchStripeLineItems } from "@/lib/sync/stripe-line-items";
import { needsProductCheck, parseRelayConfig } from "@/lib/sync/stripe-relay";

// The target (100 knjiga) answers in ~10–18 s.
export const maxDuration = 60;

// Forwards a Stripe webhook to an external handler only when the Checkout
// Session is for one of the configured products. See lib/sync/stripe-relay.ts.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ relayId: string }> }
) {
  const { relayId } = await params;
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  // The target verifies the signature itself; without one there is nothing to relay.
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const supabase = adminClient();
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "stripe_relays")
    .maybeSingle();
  const config = parseRelayConfig(setting?.value, relayId);
  if (!config) {
    console.error(`[stripe-relay] unknown relay "${relayId}"`);
    return NextResponse.json({ error: "Unknown relay" }, { status: 404 });
  }

  let event: { type?: string; id?: string; data?: { object?: unknown } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const type = String(event.type ?? "");

  if (needsProductCheck(type)) {
    const { data: site } = await supabase
      .from("sites")
      .select("consumer_key")
      .eq("id", config.site_id)
      .single();
    try {
      const { items } = await fetchStripeLineItems(event.data?.object, site?.consumer_key ?? "");
      const mine = items.some((li) => li.product && config.products.includes(li.product));
      if (!mine) {
        console.log(`[stripe-relay] ${relayId}: skipped ${type} ${event.id} (other product)`);
        return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
      }
    } catch (err) {
      // 500 → Stripe retries later instead of us guessing.
      console.error(`[stripe-relay] ${relayId}: line item lookup failed:`, (err as Error).message);
      return NextResponse.json({ error: "Line item lookup failed" }, { status: 500 });
    }
  }

  // Forward byte-for-byte with the original signature.
  try {
    const res = await fetch(config.target, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        "stripe-signature": signature,
        "user-agent": request.headers.get("user-agent") ?? "Stripe/1.0",
      },
      body: rawBody,
    });
    const body = await res.text();
    console.log(`[stripe-relay] ${relayId}: forwarded ${type} ${event.id} → ${res.status}`);
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "text/plain" },
    });
  } catch (err) {
    console.error(`[stripe-relay] ${relayId}: forward failed:`, (err as Error).message);
    return NextResponse.json({ error: "Forward failed" }, { status: 502 });
  }
}
