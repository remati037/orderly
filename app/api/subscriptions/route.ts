import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

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
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  const [subsRes, sitesRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, site_id, customer_id, product_name, mrr, status, started_at, customers(id, name, email), sites(id, name, color_hex, platform, project_type)"
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
  const totalMRR = activeSubs.reduce((s, sub) => s + (sub.mrr ?? 0), 0);

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

  // MRR chart: for each of last 6 months, sum MRR from active subs started before end of that month
  const mrrChart = Array.from({ length: 6 }, (_, i) => {
    const offset = i - 5;
    const end = monthEnd(offset);
    const mrrAtMonth = subs
      .filter((s) => s.started_at < end && s.status === "active")
      .reduce((sum, s) => sum + (s.mrr ?? 0), 0);
    return { month: monthLabel(offset), mrr: mrrAtMonth };
  });

  return NextResponse.json({
    subscriptions: subs,
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
