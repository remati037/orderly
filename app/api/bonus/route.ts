import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { customBounds } from "@/lib/utils/tz";
import { fetchPaidOrders, fetchRefunds, type RevenueOrder, type RevenueRefund } from "@/lib/metrics";
import { computeBonus, siteShare, sortedTiers, tierRate, type BonusProgram } from "@/lib/bonus/program";

type Row = RevenueOrder & { site_id: string; created_at: string };
type RefundRow = RevenueRefund & { site_id: string; refunded_at: string };

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" });

// Black Friday bonus: net revenue per site in the program window, counted with
// each site's share (partners 50%), the bonus tier reached and a daily series.
export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();
  const [{ data: cfg }, fx, sitesRes] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "bonus_program").maybeSingle(),
    loadFxSettings(supabase),
    supabase.from("sites").select("id, name, color_hex, created_at").order("created_at"),
  ]);
  const program = cfg?.value as BonusProgram | undefined;
  if (!program) return NextResponse.json({ error: "Bonus program is not configured" }, { status: 404 });

  const { start, end } = customBounds(program.from, program.to);
  const [orders, refunds] = await Promise.all([
    fetchPaidOrders<Row>(supabase, { start, end }, "site_id, created_at"),
    fetchRefunds<RefundRow>(supabase, { start, end }, "site_id, refunded_at"),
  ]);
  if (orders.error || refunds.error)
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });

  // Every day of the window, so the chart has a point even on empty days.
  const days = new Map<string, number>();
  for (let t = new Date(start).getTime() + 12 * 3_600_000; t < new Date(end).getTime(); t += 86_400_000)
    days.set(dayKey.format(new Date(t)), 0);

  const bySite = new Map<string, { revenue: number; orders: number }>();
  const add = (siteId: string, at: string, amount: number, order: boolean) => {
    const s = bySite.get(siteId) ?? { revenue: 0, orders: 0 };
    s.revenue += amount;
    if (order) s.orders++;
    bySite.set(siteId, s);
    const k = dayKey.format(new Date(at));
    days.set(k, (days.get(k) ?? 0) + amount * siteShare(program, siteId));
  };
  for (const o of orders.data) add(o.site_id, o.created_at, toBase(Number(o.total ?? 0), o.currency ?? "RSD", fx.rates), true);
  for (const r of refunds.data) add(r.site_id, r.refunded_at, -toBase(Number(r.amount), r.currency, fx.rates), false);

  const sites = (sitesRes.data ?? [])
    .map((s) => {
      const v = bySite.get(s.id) ?? { revenue: 0, orders: 0 };
      const share = siteShare(program, s.id);
      return { site_id: s.id, name: s.name, color: s.color_hex, share, revenue: v.revenue, counted: v.revenue * share, orders: v.orders };
    })
    .sort((a, b) => b.counted - a.counted);

  const counted = sites.reduce((sum, s) => sum + s.counted, 0);

  // Straight-line projection to the end of the window, once a full day is in.
  const now = Date.now();
  const totalDays = days.size;
  const elapsedDays = Math.min(totalDays, Math.max(0, (now - new Date(start).getTime()) / 86_400_000));
  const projected = elapsedDays >= 1 && elapsedDays < totalDays ? (counted / elapsedDays) * totalDays : null;

  // Future days stay in the series (fixed x axis) but without a running total.
  const today = dayKey.format(new Date(now));
  let running = 0;
  return NextResponse.json({
    name: program.name,
    from: program.from,
    to: program.to,
    people: program.people,
    base_currency: fx.baseCurrency,
    revenue: sites.reduce((sum, s) => sum + s.revenue, 0),
    counted,
    bonus: computeBonus(program, counted),
    projected: projected === null ? null : { counted: projected, bonus: computeBonus(program, projected) },
    elapsed_days: elapsedDays,
    total_days: totalDays,
    tiers: sortedTiers(program).map((t) => ({ ...t, rate: tierRate(t), per_person: t.amount / program.people })),
    sites,
    days: [...days].map(([date, value]) => ({
      date,
      counted: value,
      cumulative: date > today ? null : (running += value),
    })),
  });
}
