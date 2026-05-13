"use client";

import useSWR from "swr";
import { formatCurrency } from "@/lib/utils/currency";

// ── types ──────────────────────────────────────────────────────────────────────

interface KpiRaw {
  base_currency:      string;
  revenue_today:      number;
  revenue_yesterday:  number;
  revenue_month:      number;
  revenue_last_month: number;
  orders_today:       number;
  orders_yesterday:   number;
  aov_today:          number;
  net_profit_today:   number;
  active_sites:       number;
}

export interface KpiStats {
  // raw
  base_currency:      string;
  revenue_today:      number;
  revenue_yesterday:  number;
  revenue_month:      number;
  revenue_last_month: number;
  orders_today:       number;
  orders_yesterday:   number;
  aov_today:          number;
  net_profit_today:   number;
  active_sites:       number;
  // formatted (in base currency)
  revenue_today_fmt:    string;
  revenue_month_fmt:    string;
  aov_today_fmt:        string;
  net_profit_today_fmt: string;
  // trends (signed string, e.g. "+12.5" or "-3.2")
  trend_revenue: string;
  trend_orders:  string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

// Keep formatRSD exported — used in orders-table-client and other components
export function formatRSD(amount: number): string {
  return `${Math.round(amount).toLocaleString("sr-RS")} RSD`;
}

function trend(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100.0" : "0.0";
  const pct = ((current - previous) / previous) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1);
}

function buildStats(raw: KpiRaw): KpiStats {
  const bc = raw.base_currency ?? "RSD";
  return {
    // raw
    base_currency:      bc,
    revenue_today:      raw.revenue_today,
    revenue_yesterday:  raw.revenue_yesterday,
    revenue_month:      raw.revenue_month,
    revenue_last_month: raw.revenue_last_month,
    orders_today:       raw.orders_today,
    orders_yesterday:   raw.orders_yesterday,
    aov_today:          raw.aov_today,
    net_profit_today:   raw.net_profit_today,
    active_sites:       raw.active_sites,
    // formatted
    revenue_today_fmt:    formatCurrency(raw.revenue_today,     bc),
    revenue_month_fmt:    formatCurrency(raw.revenue_month,     bc),
    aov_today_fmt:        formatCurrency(raw.aov_today,         bc),
    net_profit_today_fmt: formatCurrency(raw.net_profit_today,  bc),
    // trends
    trend_revenue: trend(raw.revenue_today, raw.revenue_yesterday),
    trend_orders:  trend(raw.orders_today,  raw.orders_yesterday),
  };
}

async function fetcher(url: string): Promise<KpiRaw> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch KPI data");
  return res.json();
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useKpiStats(siteId?: string): {
  stats: KpiStats | null;
  isLoading: boolean;
  error: Error | null;
} {
  const url = siteId ? `/api/stats/kpi?siteId=${siteId}` : "/api/stats/kpi";
  const { data, error, isLoading } = useSWR<KpiRaw>(
    url,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  return {
    stats: data ? buildStats(data) : null,
    isLoading,
    error: error ?? null,
  };
}
