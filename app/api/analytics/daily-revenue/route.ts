import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchDailyStats } from "@/lib/metrics";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { dayBounds, belgradeDayLabel } from "@/lib/utils/tz";

// Belgrade-local YYYY-MM-DD, the `day` key of daily_stats.
const belgradeDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date(iso));

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const days   = Math.min(90, Math.max(1, Number(searchParams.get("days") ?? 30)));
  const siteId = searchParams.get("siteId");

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  // Belgrade calendar days — the server runs in UTC. Whole days, so the
  // pre-aggregated daily_stats (net revenue = gross − refunds that day).
  const [statsRes, sitesRes] = await Promise.all([
    fetchDailyStats(supabase, {
      fromDay: belgradeDay(dayBounds(-(days - 1)).start),
      toDay: belgradeDay(dayBounds(0).start),
      siteId,
    }),
    supabase.from("sites").select("id, name, color_hex"),
  ]);

  if (statsRes.error)
    return NextResponse.json({ error: (statsRes.error as Error).message }, { status: 500 });

  const stats = statsRes.data;
  const sites = sitesRes.data ?? [];

  // Build date range labels DD.MM
  const dateLabels: string[] = [];
  for (let i = days - 1; i >= 0; i--) dateLabels.push(belgradeDayLabel(dayBounds(-i).start));

  const siteMap = new Map(sites.map((s) => [s.id, s]));

  // Aggregate: { date -> { siteId -> revenue in base currency } }
  const byDateSite: Record<string, Record<string, number>> = {};
  for (const label of dateLabels) byDateSite[label] = {};

  for (const row of stats) {
    // `day` is a calendar date; noon UTC is the same date in Belgrade.
    const label = belgradeDayLabel(`${row.day}T12:00:00Z`);
    if (!byDateSite[label]) continue;
    const converted = toBase(Number(row.net), row.currency, fx.rates);
    byDateSite[label][row.site_id] = (byDateSite[label][row.site_id] ?? 0) + converted;
  }

  const activeSiteIds = siteId
    ? [siteId]
    : [...new Set(stats.map((r) => r.site_id))];

  const series = activeSiteIds.map((sid) => {
    const site = siteMap.get(sid);
    return {
      siteId: sid,
      name:   site?.name    ?? sid,
      color:  site?.color_hex ?? "#16A34A",
      data:   dateLabels.map((label) => byDateSite[label][sid] ?? 0),
    };
  });

  const totals = dateLabels.map((label) =>
    Object.values(byDateSite[label]).reduce((s, v) => s + v, 0)
  );

  return NextResponse.json({ labels: dateLabels, series, totals, base_currency: fx.baseCurrency });
}
