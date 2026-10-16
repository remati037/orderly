import { NextRequest, NextResponse } from "next/server";
import { gatewayRoute } from "@/lib/sms/gateway-route";

// The gateway polls this. sms_claim() hands out approved, due messages exactly
// once (and only 08:00–21:00 Belgrade time), so a retry can't double-send.
export async function POST(request: NextRequest) {
  return gatewayRoute(request, async (supabase) => {
    const { data, error } = await supabase.rpc("sms_claim", { max_rows: 10 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const messages = (data ?? []).map(
      (r: { msg_id: string; msg_to: string; msg_body: string }) => ({
        id: r.msg_id,
        to: r.msg_to,
        text: r.msg_body,
      })
    );
    return NextResponse.json({ messages });
  });
}
