import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

const WINDOW_DAYS = 7;

// A simple "who's been called" checklist for recently-successful (processing)
// orders — deliberately NOT part of recovery_tasks (see 014_processing_calls.sql
// for why: processing is a paid status, mixing it into the unpaid-orders
// pipeline would fight the recovery trigger).
export async function GET() {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const supabase = adminClient();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, woo_order_id, total, currency, created_at, customer_name, customer_email, customer_phone, " +
      "sites(name, color_hex), order_items(product_name), processing_calls(called_at)"
    )
    .eq("status", "processing")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (data ?? []).map((o: any) => ({
    id: o.id,
    order_number: o.woo_order_id ?? null,
    total: Number(o.total ?? 0),
    currency: o.currency ?? "RSD",
    customer_name: o.customer_name ?? null,
    customer_email: o.customer_email ?? null,
    customer_phone: o.customer_phone ?? null,
    product_name: o.order_items?.[0]?.product_name ?? null,
    site_name: o.sites?.name ?? null,
    site_color: o.sites?.color_hex ?? "#16A34A",
    created_at: o.created_at,
    // order_id is UNIQUE, so PostgREST embeds this as a single object (or
    // null), not an array — despite the reverse-FK embed syntax below.
    called_at: o.processing_calls?.called_at ?? null,
  }));

  return NextResponse.json({ orders });
}

// Mark (or re-mark) an order as called.
export async function POST(request: NextRequest) {
  const { error: authError, member } = await requireRole(["owner", "agent"]);
  if (authError) return authError;
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { order_id } = await request.json();
  if (!order_id) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase
    .from("processing_calls")
    .upsert(
      { order_id, called_by: member.id, called_at: new Date().toISOString() },
      { onConflict: "order_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Undo an accidental "called" mark.
export async function DELETE(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const orderId = new URL(request.url).searchParams.get("order_id");
  if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase.from("processing_calls").delete().eq("order_id", orderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
