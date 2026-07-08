import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { loadFxSettings, toBase } from "@/lib/utils/fx";

// ── Holt's linear exponential smoothing ───────────────────────────────────────

function holtForecast(
  data: number[],
  alpha = 0.3,
  beta = 0.1,
  horizon = 30
): { smoothed: number[]; forecast: number[] } {
  if (data.length < 2) {
    const last = data[data.length - 1] ?? 0;
    return {
      smoothed: data.slice(),
      forecast: Array(horizon).fill(last),
    };
  }

  let level = data[0];
  let trend = data[1] - data[0];
  const smoothed: number[] = [level];

  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    smoothed.push(level);
  }

  const forecast = Array.from({ length: horizon }, (_, h) =>
    Math.max(0, level + (h + 1) * trend)
  );

  return { smoothed, forecast };
}

function dateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  const HISTORY_DAYS = 90;
  const FORECAST_DAYS = 30;

  const from = new Date();
  from.setDate(from.getDate() - HISTORY_DAYS + 1);
  from.setHours(0, 0, 0, 0);

  const { data: orders } = await supabase
    .from("orders")
    .select("total, currency, created_at")
    .gte("created_at", from.toISOString())
    .in("status", COUNTED_STATUSES)
    .order("created_at");

  // Aggregate daily totals
  const dailyMap: Record<string, number> = {};
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    dailyMap[dateLabel(d)] = 0;
  }

  for (const order of orders ?? []) {
    const d = new Date(order.created_at);
    const label = dateLabel(d);
    if (label in dailyMap) {
      dailyMap[label] = (dailyMap[label] ?? 0) + toBase(order.total ?? 0, order.currency ?? "RSD", fx.rates);
    }
  }

  const historicalLabels = Object.keys(dailyMap);
  const historicalValues = historicalLabels.map((l) => dailyMap[l]);

  const { smoothed, forecast } = holtForecast(
    historicalValues,
    0.3,
    0.1,
    FORECAST_DAYS
  );

  // Build forecast labels (days after today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastLabels = Array.from({ length: FORECAST_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i + 1);
    return dateLabel(d);
  });

  // Projected revenue for current month:
  // realized so far this month + forecast for remaining days
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / 86_400_000;
  const dayOfMonth = today.getDate();
  const remainingDays = daysInMonth - dayOfMonth;

  const realizedThisMonth = (orders ?? [])
    .filter((o) => new Date(o.created_at) >= monthStart)
    .reduce((s, o) => s + toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates), 0);

  const avgForecastDaily = forecast.slice(0, Math.ceil(remainingDays)).reduce((s, v, _, arr) => s + v / arr.length, 0);
  const projectedMonthRevenue = Math.round(
    realizedThisMonth + avgForecastDaily * remainingDays
  );

  return NextResponse.json({
    historical_labels: historicalLabels,
    historical_values: historicalValues,
    smoothed_values: smoothed.map((v) => Math.round(v)),
    forecast_labels: forecastLabels,
    forecast_values: forecast.map((v) => Math.round(v)),
    projected_month_revenue: projectedMonthRevenue,
  });
}
