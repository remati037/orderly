import { NextRequest, NextResponse } from "next/server";
import { gatewayRoute } from "@/lib/sms/gateway-route";

// The gateway reports what happened to a claimed message. A sent reminder counts
// as a contact attempt on the task, exactly like logging a phone call would.
export async function POST(request: NextRequest) {
  return gatewayRoute(request, async (supabase) => {
    const { id, ok, error: sendError } = await request.json();
    if (!id || typeof ok !== "boolean")
      return NextResponse.json({ error: "id and ok are required" }, { status: 400 });

    const now = new Date().toISOString();
    const { data: msg, error } = await supabase
      .from("sms_outbox")
      .update(
        ok
          ? { status: "sent", sent_at: now, error: null, updated_at: now }
          : { status: "failed", error: String(sendError ?? "unknown error").slice(0, 500), updated_at: now }
      )
      .eq("id", id)
      .eq("status", "sending") // never overwrite a row the gateway didn't claim
      .select("task_id, step")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!msg) return NextResponse.json({ error: "message not in 'sending' state" }, { status: 409 });

    if (ok) {
      await supabase
        .from("recovery_notes")
        .insert({ task_id: msg.task_id, channel: "sms", body: `SMS podsetnik ${msg.step}/3 poslat` });

      const { data: task } = await supabase
        .from("recovery_tasks")
        .select("attempts, stage")
        .eq("id", msg.task_id)
        .single();
      await supabase
        .from("recovery_tasks")
        .update({
          attempts: (task?.attempts ?? 0) + 1,
          last_contacted_at: now,
          stage: task?.stage === "novo" ? "kontaktiran" : task?.stage,
          updated_at: now,
        })
        .eq("id", msg.task_id);
    }
    return NextResponse.json({ ok: true });
  });
}
