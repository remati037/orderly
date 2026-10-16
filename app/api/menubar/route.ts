import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { fetchPeriodActivity } from "@/lib/stats/counted-orders";
import { summarizeRevenue } from "@/lib/metrics";
import { loadFxSettings } from "@/lib/utils/fx";
import { todayComparisonBounds } from "@/lib/utils/tz";

// Today's revenue for the macOS menu bar (SwiftBar plugin in scripts/swiftbar).
// The plugin can't hold a Supabase session cookie, so this route is public in
// proxy.ts and authenticates itself with `Authorization: Bearer <token>`.
// The token is the MENUBAR_TOKEN env var, or — so it can be set without touching
// Vercel — its SHA-256 hex in settings.menubar_token_sha256. Only the hash is
// stored because every signed-in member can read the settings table.
const sha256 = (s: string) => createHash("sha256").update(s).digest();

async function expectedTokenHash(supabase: SupabaseClient): Promise<Buffer | null> {
  if (process.env.MENUBAR_TOKEN) return sha256(process.env.MENUBAR_TOKEN);
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "menubar_token_sha256")
    .maybeSingle();
  return typeof data?.value === "string" ? Buffer.from(data.value, "hex") : null;
}

export async function GET(request: NextRequest) {
  const supabase = adminClient();

  const expected = await expectedTokenHash(supabase);
  if (!expected)
    return NextResponse.json({ error: "Menu bar token not configured" }, { status: 500 });
  const given = sha256((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Today so far vs. yesterday up to the same clock time — a fair comparison
  // at any hour, unlike partial today vs. all of yesterday.
  const { current, prev } = todayComparisonBounds();

  const [fx, today, yesterday] = await Promise.all([
    loadFxSettings(supabase),
    fetchPeriodActivity(supabase, current.start, current.end),
    fetchPeriodActivity(supabase, prev.start, prev.end),
  ]);

  const error = today.error ?? yesterday.error;
  if (error) return NextResponse.json({ error: (error as Error).message }, { status: 500 });

  // Net revenue (paid orders − refunds made in the window), see lib/metrics.
  const t = summarizeRevenue(today.orders, today.refunds, fx.rates);
  const y = summarizeRevenue(yesterday.orders, yesterday.refunds, fx.rates);
  const lastOrderAt = today.orders.reduce<string | null>(
    (last, o) => (!last || o.created_at > last ? o.created_at : last),
    null
  );

  return NextResponse.json(
    {
      base_currency: fx.baseCurrency,
      revenue: t.net,
      orders: t.orders,
      yesterday_revenue: y.net,
      yesterday_orders: y.orders,
      last_order_at: lastOrderAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
