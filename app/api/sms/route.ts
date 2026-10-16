import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

// Reminders for one or more tasks (a merged board card can fold in several),
// or ?summary=1 for the count waiting on a decision.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const params = new URL(request.url).searchParams;
  const supabase = adminClient();

  if (params.get("summary")) {
    const { count } = await supabase
      .from("sms_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");
    return NextResponse.json({ pending: count ?? 0 });
  }

  // The whole queue with who/what each message is about: everything still
  // waiting on a person or in flight, plus anything that failed.
  if (params.get("queue")) {
    const { data, error } = await supabase
      .from("sms_outbox")
      .select(
        "id, task_id, step, to_number, body, status, due_at, error, " +
        "task:recovery_tasks!inner(order:orders!inner(woo_order_id, total, currency, customer_name, sites(name)))"
      )
      .in("status", ["pending_approval", "approved", "sending", "failed"])
      .order("due_at", { ascending: true })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data ?? [] });
  }

  const taskIds = (params.get("taskId") ?? "").split(",").filter(Boolean);
  if (taskIds.length === 0)
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("sms_outbox")
    .select("id, task_id, step, to_number, body, status, due_at, approved_at, sent_at, error, cancel_reason")
    .in("task_id", taskIds)
    .order("step", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

// approve | cancel | edit. Only a person flips pending_approval → approved; the
// gateway never sees a message that wasn't explicitly approved here.
export async function PATCH(request: NextRequest) {
  const { error: authError, member } = await requireRole(["owner", "agent"]);
  if (authError) return authError;
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action, body } = await request.json();
  if (!id || !["approve", "cancel", "edit"].includes(action))
    return NextResponse.json({ error: "id and a valid action are required" }, { status: 400 });

  const supabase = adminClient();
  const now = new Date().toISOString();

  let patch: Record<string, unknown>;
  let from: string[];
  if (action === "approve") {
    patch = { status: "approved", approved_by: member.id, approved_at: now };
    from = ["pending_approval"];
  } else if (action === "cancel") {
    patch = { status: "cancelled", cancel_reason: `cancelled by ${member.email}` };
    from = ["pending_approval", "approved"];
  } else {
    const text = typeof body === "string" ? body.trim() : "";
    if (!text || text.length > 480)
      return NextResponse.json({ error: "Tekst mora imati 1–480 znakova" }, { status: 400 });
    patch = { body: text };
    from = ["pending_approval"]; // editing an approved message would send text nobody reviewed
  }

  const { data, error } = await supabase
    .from("sms_outbox")
    .update({ ...patch, updated_at: now })
    .eq("id", id)
    .in("status", from)
    .select("id, status, body")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json(
      { error: "Poruka više nije u stanju u kom se ova radnja može izvršiti" },
      { status: 409 }
    );
  return NextResponse.json({ message: data });
}
