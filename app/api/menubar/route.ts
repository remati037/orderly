import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { fetchCountedOrders, type CountedOrder } from "@/lib/stats/counted-orders";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
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
