import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { dayBounds, monthBounds, belgradeDayLabel, belgradeMonthProgress } from "@/lib/utils/tz";

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

export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  const HISTORY_DAYS = 90;
  const FORECAST_DAYS = 30;

  // Belgrade calendar days — the server runs in UTC.
  const from = dayBounds(-(HISTORY_DAYS - 1)).start;

  const { data: orders } = await fetchAll(() =>
    supabase
      .from("orders")
      .select("total, currency, created_at")
      .gte("created_at", from)
      .in("status", COUNTED_STATUSES)
      .order("created_at")
      .order("id")
  );

  // Aggregate daily totals
  const dailyMap: Record<string, number> = {};
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) dailyMap[belgradeDayLabel(dayBounds(-i).start)] = 0;

  for (const order of orders ?? []) {
    const label = belgradeDayLabel(order.created_at);
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
  const forecastLabels = Array.from({ length: FORECAST_DAYS }, (_, i) =>
    belgradeDayLabel(dayBounds(i + 1).start)
  );

  // Projected revenue for current month:
  // realized so far this month + forecast for remaining days
  const monthStart = monthBounds(0).start;
  const { dayOfMonth, daysInMonth } = belgradeMonthProgress();
  const remainingDays = daysInMonth - dayOfMonth;

  const realizedThisMonth = (orders ?? [])
    .filter((o) => new Date(o.created_at) >= new Date(monthStart))
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
