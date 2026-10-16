import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchPeriodActivity, summarizeActivity } from "@/lib/stats/counted-orders";
import { loadFxSettings } from "@/lib/utils/fx";
import { dayBounds } from "@/lib/utils/tz";

const TZ = "Europe/Belgrade";

// Belgrade-local YYYY-MM-DD for a given instant.
function belgradeDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp            = new URL(request.url).searchParams;
  const days          = Math.min(30, Math.max(2, Number(sp.get("days") ?? 7)));
  const siteId        = sp.get("siteId");
  const productsParam = sp.get("products");
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : null;

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  // Build the list of Belgrade day labels, oldest → newest.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayKeys.push(belgradeDay(dayBounds(-i).start));
  }
  const from = dayBounds(-(days - 1)).start;
  const to   = dayBounds(0).end;

  // Raw rows rather than daily_stats so the product filter keeps working.
  // Revenue is net: orders on their day minus refunds on the refund's day.
  const activity = await fetchPeriodActivity(supabase, from, to, siteId, products);
  const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
  const s = summarizeActivity(activity, fx.rates, days, (iso) => dayIndex.get(belgradeDay(iso)) ?? -1);

  const revenue = s.buckets.map((v) => Math.round(v));
  const orders  = s.orderBuckets;
  const aov     = dayKeys.map((_, i) => (orders[i] > 0 ? Math.round(revenue[i] / orders[i]) : 0));

  return NextResponse.json({ labels: dayKeys, revenue, orders, aov });
}
