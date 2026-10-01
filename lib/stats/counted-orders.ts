import { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

export interface CountedOrder {
  total: number | null;
  currency: string | null;
  created_at: string;
}

// Every revenue-counting order created in [start, end), optionally for one site.
// Shared by the TV board and the menu bar endpoint so both count the same orders.
export function fetchCountedOrders(
  supabase: SupabaseClient,
  start: string,
  end: string,
  siteId?: string | null
) {
  return fetchAll<CountedOrder>(() => {
    let q = supabase
      .from("orders")
      .select("total, currency, created_at")
      .gte("created_at", start)
      .lt("created_at", end)
      .in("status", COUNTED_STATUSES)
      .order("id");
    if (siteId) q = q.eq("site_id", siteId);
    return q;
  });
}
