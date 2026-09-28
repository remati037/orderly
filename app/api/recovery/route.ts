import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { requireRole } from "@/lib/auth/roles";
import { dayBoundsForDate } from "@/lib/utils/tz";
import { computeSubscriptionOrdinals } from "@/lib/utils/subscription-ordinal";

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
    const { data: successOrders } = await fetchAll(() =>
      supabase
        .from("orders")
        .select("customer_email, created_at")
        .in("status", ["processing", "completed"])
        .gte("created_at", cutoff)
        .not("customer_email", "is", null)
        .order("id")
    );

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

  const subscriptionSeq = await computeSubscriptionOrdinals(
    supabase,
    rows
      .filter((t) => t.order)
      .map((t) => ({
        id: t.order.id as string,
        customer_email: t.order.customer_email ?? null,
        product_name: t.order.order_items?.[0]?.product_name ?? null,
        created_at: t.order.created_at as string,
      }))
  );

  // Stripe retries a failed subscription charge every ~1-3 days. Each retry is a
  // brand new order (see normalize-stripe-event.ts — keyed on the charge, never
  // the invoice), so it gets its own recovery_task and lands back in "Novo" even
  // though the customer was already contacted about the previous attempt. Group
  // by (customer_email, product_name) and merge same-group tasks into one card so
  // retries don't reset contact history or clutter the board — and so "how many
  // unique people did we call" is just the number of groups.
  const STAGE_RANK: Record<string, number> = {
    novo: 0, kontaktiran: 1, ceka_uplatu: 2, otkazano: 3, naplaceno: 4,
  };

  const groups = new Map<string, typeof rows>();
  for (const t of rows) {
    const email = t.order?.customer_email?.toLowerCase();
    const product = t.order?.order_items?.[0]?.product_name;
    const key = email && product ? `${email}|${product}` : `solo:${t.id}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const tasks = Array.from(groups.values())
    .map((members) => {
      // Latest order/attempt drives everything the agent acts on right now.
      const sorted = [...members].sort(
        (a, b) => new Date(a.order?.created_at ?? 0).getTime() - new Date(b.order?.created_at ?? 0).getTime()
      );
      const canonical = sorted[sorted.length - 1];
      const o = canonical.order;
      const site = o?.sites;

      const earliestTaskCreatedAt = Math.min(
        ...sorted.map((m) => (m.created_at ? new Date(m.created_at).getTime() : Date.now()))
      );
      const contactTimes = sorted
        .map((m) => (m.last_contacted_at ? new Date(m.last_contacted_at).getTime() : null))
        .filter((ms): ms is number => ms !== null);
      const earliestContactedAt = contactTimes.length ? Math.min(...contactTimes) : null;
      const totalAttempts = sorted.reduce((s, m) => s + (m.attempts ?? 0), 0);
      const mergedStage = sorted.reduce(
        (best, m) => (STAGE_RANK[m.stage] > STAGE_RANK[best] ? m.stage : best),
        sorted[0].stage
      );

      const createdAt = o?.created_at ? new Date(o.created_at).getTime() : Date.now();

      return {
        id: canonical.id,
        stage: mergedStage,
        assigned_to: canonical.assigned_to,
        attempts: totalAttempts,
        last_contacted_at: earliestContactedAt !== null ? new Date(earliestContactedAt).toISOString() : null,
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
        // Time waiting for a call: from the FIRST attempt, not the latest retry.
        wait_ms: (earliestContactedAt ?? Date.now()) - earliestTaskCreatedAt,
        wait_frozen: earliestContactedAt !== null,
        resolved_elsewhere: o?.status === "failed" && hasSameDaySuccess(o?.customer_email ?? null, o?.created_at),
        subscription_seq: o?.id ? subscriptionSeq.get(o.id) ?? null : null,
        // Every recovery_tasks row folded into this card — used to fetch the full
        // note history and to apply stage/assignment changes to the whole group.
        linked_task_ids: sorted.map((m) => m.id),
        retry_count: sorted.length,
      };
    })
    // Only orders from the last 30 days stay on the board.
    .filter((t) => t.age_days <= MAX_AGE_DAYS);

  return NextResponse.json({ tasks, members: membersRes.data ?? [] });
}

// Move a task between stages, or (re)assign it. A card on the board can
// represent several merged retry attempts (see GET) — pass linked_task_ids to
// apply the change to the whole group, so a later retry doesn't un-merge back
// to a lower stage than what the agent already set.
export async function PATCH(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const { id, stage, assigned_to, linked_task_ids } = await request.json();
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

  const ids: string[] = Array.isArray(linked_task_ids) && linked_task_ids.length ? linked_task_ids : [id];

  const supabase = adminClient();
  const { error } = await supabase.from("recovery_tasks").update(patch).in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
