import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { customBounds } from "@/lib/utils/tz";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  PAID_STATUSES, fetchPaidOrders, fetchRefunds, orderKeptShare, type RevenueOrder, type RevenueRefund,
} from "@/lib/metrics";
import { computeBonus, siteShare, sortedTiers, tierRate, type BonusProgram } from "@/lib/bonus/program";

type Row = RevenueOrder & { site_id: string; created_at: string };
type RefundRow = RevenueRefund & { site_id: string; refunded_at: string };
interface ItemRow {
  product_name: string | null;
  quantity: number | null;
  price: number | null;
  order: { site_id: string; currency: string | null; total: number | null; refunded_total: number | null };
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" });

// Black Friday bonus: net revenue per site in the program window, counted with
// each site's share (partners 50%), the bonus tier reached and a daily series.
export async function GET() {
  // Agents see the numbers; only the owner edits product goals.
  const { error: authError, member } = await requireRole(["owner", "agent"]);
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
  const [orders, refunds, items] = await Promise.all([
    fetchPaidOrders<Row>(supabase, { start, end }, "site_id, created_at"),
    fetchRefunds<RefundRow>(supabase, { start, end }, "site_id, refunded_at"),
    fetchAll(() =>
      supabase
        .from("order_items")
        .select("product_name, quantity, price, order:orders!inner(site_id, currency, total, refunded_total, created_at, status)")
        .in("order.status", PAID_STATUSES)
        .gte("order.created_at", start)
        .lt("order.created_at", end)
        .order("id")
    ),
  ]);
  if (orders.error || refunds.error || items.error)
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

  // Products per site: each line's share of its order's own net (same as Top
  // proizvodi), so product sums can differ slightly from the site total when a
  // refund lands in another month. Products with a goal show even without sales.
  const products = new Map<string, Map<string, { revenue: number; units: number }>>();
  const product = (siteId: string, name: string) => {
    let site = products.get(siteId);
    if (!site) products.set(siteId, (site = new Map()));
    let p = site.get(name);
    if (!p) site.set(name, (p = { revenue: 0, units: 0 }));
    return p;
  };
  for (const it of items.data as unknown as ItemRow[]) {
    const p = product(it.order.site_id, it.product_name ?? "Nepoznat proizvod");
    const qty = it.quantity ?? 1;
    p.units += qty;
    p.revenue += toBase(Number(it.price ?? 0) * qty * orderKeptShare(it.order), it.order.currency ?? "RSD", fx.rates);
  }
  for (const [siteId, goals] of Object.entries(program.product_goals ?? {}))
    for (const name of Object.keys(goals)) product(siteId, name);

  const sites = (sitesRes.data ?? [])
    .map((s) => {
      const v = bySite.get(s.id) ?? { revenue: 0, orders: 0 };
      const share = siteShare(program, s.id);
      const goals = program.product_goals?.[s.id] ?? {};
      const siteProducts = [...(products.get(s.id) ?? [])]
        .map(([name, p]) => ({ name, revenue: p.revenue, counted: p.revenue * share, units: p.units, goal: goals[name] ?? null }))
        .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
      return {
        site_id: s.id, name: s.name, color: s.color_hex, share,
        revenue: v.revenue, counted: v.revenue * share, orders: v.orders, products: siteProducts,
      };
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
    can_edit: member?.role === "owner",
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
