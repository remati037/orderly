import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchCountedOrders } from "@/lib/stats/counted-orders";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { dayBounds } from "@/lib/utils/tz";

const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", hour: "2-digit", hourCycle: "h23" });

// Today's totals for the TV board, computed from every order of the Belgrade
// day (not the capped realtime feed) with the same counted statuses as the KPIs.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const siteId = new URL(request.url).searchParams.get("siteId");
  const supabase = adminClient();
  const { start, end } = dayBounds(0);

  const [fx, { data: rows, error }] = await Promise.all([
    loadFxSettings(supabase),
    fetchCountedOrders(supabase, start, end, siteId),
  ]);

  if (error) return NextResponse.json({ error: (error as Error).message }, { status: 500 });

  const hourly = Array<number>(24).fill(0);
  let revenue = 0;
  let lastOrderAt: string | null = null;
  for (const o of rows) {
    const amount = toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates);
    revenue += amount;
    hourly[Number(hourFmt.format(new Date(o.created_at)))] += amount;
    if (!lastOrderAt || o.created_at > lastOrderAt) lastOrderAt = o.created_at;
  }

  return NextResponse.json({
    base_currency: fx.baseCurrency,
    revenue,
    orders: rows.length,
    hourly,
    current_hour: Number(hourFmt.format(new Date())),
    last_order_at: lastOrderAt,
  });
}
