import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchPeriodActivity, summarizeActivity } from "@/lib/stats/counted-orders";
import { loadFxSettings } from "@/lib/utils/fx";
import { dayBounds } from "@/lib/utils/tz";

const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", hour: "2-digit", hourCycle: "h23" });
const hourOf = (iso: string) => Number(hourFmt.format(new Date(iso)));

// Today's totals for the TV board, computed from every order of the Belgrade
// day (not the capped realtime feed) with the same definitions as the KPIs:
// revenue is net (paid orders − refunds made today), see lib/metrics.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const siteId = new URL(request.url).searchParams.get("siteId");
  const supabase = adminClient();
  const { start, end } = dayBounds(0);

  const [fx, activity] = await Promise.all([
    loadFxSettings(supabase),
    fetchPeriodActivity(supabase, start, end, siteId),
  ]);

  if (activity.error)
    return NextResponse.json({ error: (activity.error as Error).message }, { status: 500 });

  const s = summarizeActivity(activity, fx.rates, 24, hourOf);

  return NextResponse.json({
    base_currency: fx.baseCurrency,
    revenue: s.net,
    orders: s.orders,
    gross: s.gross,
    refunds: s.refunds,
    refund_count: s.refundCount,
    hourly: s.buckets,
    current_hour: hourOf(new Date().toISOString()),
    last_order_at: s.lastOrderAt,
  });
}
