import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";
import { dayBoundsForDate } from "@/lib/utils/tz";

const STAGES = ["novo", "kontaktiran", "ceka_uplatu", "naplaceno", "otkazano"] as const;

const MAX_AGE_DAYS = 30;

// Human explanation of why an order is stuck. Stripe puts a real message on the
// charge (stored in woo_data); WooCommerce statuses get a sensible default.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stuckReason(status: string, wooData: any): string {
  const wd = wooData ?? {};
  const stripeMsg =
    wd.failure_message ||
    wd.outcome?.seller_message ||
    wd.outcome?.reason ||
    (wd.failure_code ? `Stripe kod: ${wd.failure_code}` : null);
  if (stripeMsg) return String(stripeMsg);

  switch (status) {
    case "failed":         return "Plaćanje nije uspelo — kartica odbijena ili greška u naplati.";
    case "on-hold":        return "Čeka uplatu — bankovni transfer ili ručna potvrda.";
    case "pending":        return "Plaćanje započeto, ali nije završeno.";
    case "checkout-draft": return "Napuštena korpa — kupac nije završio kupovinu.";
    default:               return "";
  }
}

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
        "order:orders!inner(id, woo_order_id, status, total, currency, created_at, woo_data, " +
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
  const rows = (tasksRes.data ?? []) as any[];

  // A failed order the customer already fixed elsewhere: find same-customer orders
  // that went through (processing/completed) the same calendar day as each failed
  // order, so the board can flag "don't call — they already paid another order".
  // Keyed on customer_email, not customer_id — the sync jobs never populate
  // orders.customer_id (it's NULL on every row). Matched case-insensitively in JS
  // since emails are stored as received, not normalized to lowercase.
  const hasFailedTasks = rows.some((t) => t.order?.status === "failed");

  const successByEmail = new Map<string, string[]>();
  if (hasFailedTasks) {
    // Bounded to the board's own window — a task can't be older than MAX_AGE_DAYS.
    const cutoff = new Date(Date.now() - (MAX_AGE_DAYS + 1) * 86_400_000).toISOString();
    const { data: successOrders } = await supabase
      .from("orders")
      .select("customer_email, created_at")
      .in("status", ["processing", "completed"])
      .gte("created_at", cutoff)
      .not("customer_email", "is", null);

    for (const o of successOrders ?? []) {
      const email = (o.customer_email as string).toLowerCase();
      const list = successByEmail.get(email) ?? [];
      list.push(o.created_at as string);
      successByEmail.set(email, list);
    }
  }

  function hasSameDaySuccess(customerEmail: string | null, orderCreatedAt: string): boolean {
    if (!customerEmail) return false;
    const list = successByEmail.get(customerEmail.toLowerCase());
    if (!list?.length) return false;
    const { start, end } = dayBoundsForDate(new Date(orderCreatedAt));
    return list.some((iso) => iso >= start && iso < end);
  }

  const tasks = rows
    .map((t) => {
      const o = t.order;
      const site = o?.sites;
      const createdAt = o?.created_at ? new Date(o.created_at).getTime() : Date.now();
      const taskCreatedAt = t.created_at ? new Date(t.created_at).getTime() : Date.now();
      const contactedAt = t.last_contacted_at ? new Date(t.last_contacted_at).getTime() : null;
      return {
        id: t.id,
        stage: t.stage,
        assigned_to: t.assigned_to,
        attempts: t.attempts,
        last_contacted_at: t.last_contacted_at,
        order_id: o?.id,
        order_number: o?.woo_order_id ?? null,
        order_status: o?.status,
        // Derived server-side; raw woo_data (full billing payload) never leaves the API.
        reason: stuckReason(o?.status, o?.woo_data),
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
        // Time waiting for a call: ticks until first contact, then freezes for good.
        wait_ms: (contactedAt ?? Date.now()) - taskCreatedAt,
        wait_frozen: contactedAt !== null,
        resolved_elsewhere: o?.status === "failed" && hasSameDaySuccess(o?.customer_email ?? null, o?.created_at),
      };
    })
    // Only orders from the last 30 days stay on the board.
    .filter((t) => t.age_days <= MAX_AGE_DAYS);

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
