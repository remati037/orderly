import { NextRequest, NextResponse } from "next/server";
import { gatewayRoute } from "@/lib/sms/gateway-route";
import { inboundRow } from "@/lib/sms/inbound";

// Incoming SMS from the modem. The sms_inbox trigger matches the sender to a
// recovery task by phone number, logs it as a note and honours STOP.
export async function POST(request: NextRequest) {
  return gatewayRoute(request, async (supabase) => {
    const row = inboundRow(await request.json());
    if (!row) return NextResponse.json({ error: "from and text are required" }, { status: 400 });

    const { error } = await supabase.from("sms_inbox").insert(row);

    // 23505 = same external_id again: the gateway is retrying, already stored.
    if (error && error.code !== "23505")
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  });
}
