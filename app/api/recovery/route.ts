import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

const STAGES = ["novo", "kontaktiran", "ceka_uplatu", "naplaceno", "otkazano"] as const;

// Tasks + the members they can be assigned to.
// Agents may see the order amount (they need it to talk to the customer) but
// never net_profit — it is not selected here.
export async function GET() {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const supabase = adminClient();

  const [tasksRes, membersRes] = await Promise.all([
    supabase
      .from("recovery_tasks")
      .select(
        "id, stage, assigned_to, attempts, last_contacted_at, next_follow_up_at, created_at, " +
        "order:orders!inner(id, woo_order_id, status, total, currency, created_at, " +
        "customer_name, customer_email, customer_phone, sites(name, color_hex), order_items(product_name))"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("team_members")
      .select("id, email, name")
      .eq("is_active", true)
      .order("email"),
  ]);

  if (tasksRes.error)
    return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (tasksRes.data ?? []).map((t: any) => {
    const o = t.order;
    const site = o?.sites;
    const createdAt = o?.created_at ? new Date(o.created_at).getTime() : Date.now();
    return {
      id: t.id,
      stage: t.stage,
      assigned_to: t.assigned_to,
      attempts: t.attempts,
      last_contacted_at: t.last_contacted_at,
      order_id: o?.id,
      order_number: o?.woo_order_id ?? null,
      order_status: o?.status,
      total: Number(o?.total ?? 0),
      currency: o?.currency ?? "RSD",
      customer_name: o?.customer_name ?? null,
      customer_email: o?.customer_email ?? null,
      customer_phone: o?.customer_phone ?? null,
      product_name: o?.order_items?.[0]?.product_name ?? null,
      site_name: site?.name ?? null,
      site_color: site?.color_hex ?? "#16A34A",
      order_created_at: o?.created_at ?? null,
      age_days: Math.floor((Date.now() - createdAt) / 86_400_000),
    };
  });

  return NextResponse.json({ tasks, members: membersRes.data ?? [] });
}

// Move a task between stages, or (re)assign it.
export async function PATCH(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const { id, stage, assigned_to } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (stage !== undefined) {
    if (!STAGES.includes(stage))
      return NextResponse.json({ error: "Nepoznata faza" }, { status: 400 });
    patch.stage = stage;
  }
  // `null` clears the assignee, so check for presence rather than truthiness.
  if (assigned_to !== undefined) patch.assigned_to = assigned_to || null;

  if (Object.keys(patch).length === 1)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase.from("recovery_tasks").update(patch).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
