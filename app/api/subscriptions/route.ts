import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { currentMrr, mrrAt, subscriptionMrr } from "@/lib/metrics";

function monthLabel(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString("sr-RS", { month: "short", year: "numeric" });
}

function monthEnd(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths + 1);
  return d.toISOString();
}

export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();

  const [fx, subsRes, sitesRes] = await Promise.all([
    loadFxSettings(supabase),
    supabase
      .from("subscriptions")
      .select(
        "id, site_id, customer_id, product_name, mrr, mrr_amount, mrr_currency, status, started_at, cancelled_at, customers(id, name, email), sites(id, name, color_hex, platform, project_type)"
      )
      .order("started_at", { ascending: false }),
    supabase
      .from("sites")
      .select("id, name, color_hex, project_type")
      .eq("project_type", "subscription"),
  ]);

  const subs = subsRes.data ?? [];
  const subscriptionSites = sitesRes.data ?? [];

  const activeSubs = subs.filter((s) => s.status === "active");
  // MRR per lib/metrics: the charged amount at today's rates.
  const totalMRR = currentMrr(subs, fx.rates);

  const now = new Date();
  const thisMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  const newThisMonth = subs.filter(
    (s) => s.status === "active" && s.started_at >= thisMonthStart
  ).length;

  // Approximate churn: inactive subs that started this month (rough proxy)
  const churnedThisMonth = subs.filter(
    (s) => s.status !== "active" && s.started_at >= thisMonthStart
  ).length;

  const prevMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  ).toISOString();
  const prevActiveSubs = subs.filter(
    (s) => s.started_at < thisMonthStart && s.started_at >= prevMonthStart
  ).length;

  const churnRate =
    prevActiveSubs > 0
      ? Math.round((churnedThisMonth / prevActiveSubs) * 1000) / 10
      : 0;

  // MRR chart: MRR as it stood at the end of each of the last 6 months
  // (subs cancelled later still count for the months they were paying).
  const mrrChart = Array.from({ length: 6 }, (_, i) => {
    const offset = i - 5;
    return { month: monthLabel(offset), mrr: mrrAt(subs, monthEnd(offset), fx.rates) };
  });

  return NextResponse.json({
    // mrr_base: this subscription's MRR in the base currency at today's rates.
    subscriptions: subs.map((s) => ({ ...s, mrr_base: subscriptionMrr(s, fx.rates) })),
    subscriptionSites,
    kpi: {
      total_mrr: totalMRR,
      active_subscribers: activeSubs.length,
      new_this_month: newThisMonth,
      churned_this_month: churnedThisMonth,
      churn_rate: churnRate,
    },
    mrr_chart: mrrChart,
  });
}
