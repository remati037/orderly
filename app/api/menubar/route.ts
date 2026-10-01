import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { fetchCountedOrders, type CountedOrder } from "@/lib/stats/counted-orders";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { todayComparisonBounds } from "@/lib/utils/tz";

// Today's revenue for the macOS menu bar (SwiftBar plugin in scripts/swiftbar).
// The plugin can't hold a Supabase session cookie, so this route is public in
// proxy.ts and authenticates itself with `Authorization: Bearer $MENUBAR_TOKEN`.
function authorized(request: NextRequest, token: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  const token = process.env.MENUBAR_TOKEN;
  if (!token)
    return NextResponse.json({ error: "MENUBAR_TOKEN not configured" }, { status: 500 });
  if (!authorized(request, token))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  // Today so far vs. yesterday up to the same clock time — a fair comparison
  // at any hour, unlike partial today vs. all of yesterday.
  const { current, prev } = todayComparisonBounds();

  const [fx, today, yesterday] = await Promise.all([
    loadFxSettings(supabase),
    fetchCountedOrders(supabase, current.start, current.end),
    fetchCountedOrders(supabase, prev.start, prev.end),
  ]);

  const error = today.error ?? yesterday.error;
  if (error) return NextResponse.json({ error: (error as Error).message }, { status: 500 });

  const sum = (rows: CountedOrder[]) =>
    rows.reduce((s, o) => s + toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates), 0);
  const lastOrderAt = today.data.reduce<string | null>(
    (last, o) => (!last || o.created_at > last ? o.created_at : last),
    null
  );

  return NextResponse.json(
    {
      base_currency: fx.baseCurrency,
      revenue: sum(today.data),
      orders: today.data.length,
      yesterday_revenue: sum(yesterday.data),
      yesterday_orders: yesterday.data.length,
      last_order_at: lastOrderAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
