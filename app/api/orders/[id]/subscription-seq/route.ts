import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { computeSubscriptionOrdinals } from "@/lib/utils/subscription-ordinal";

// Single-order lookup — used by the Live Feed's realtime path, where orders
// arrive one at a time and there's no batch to compute ordinals for up front.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { id } = await params;
  const supabase = adminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, customer_email, created_at, order_items(product_name)")
    .eq("id", id)
    .single();

  if (error || !order) return NextResponse.json({ seq: null });

  const productName = order.order_items?.[0]?.product_name ?? null;
  const map = await computeSubscriptionOrdinals(supabase, [{
    id: order.id,
    customer_email: order.customer_email,
    product_name: productName,
    created_at: order.created_at,
  }]);

  return NextResponse.json({ seq: map.get(order.id) ?? null });
}
