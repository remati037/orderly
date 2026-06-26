"use client";

import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils/currency";

// ── types ──────────────────────────────────────────────────────────────────────

interface KpiRaw {
  base_currency:   string;
  revenue_current: number;
  revenue_prev:    number;
  orders_current:  number;
  orders_prev:     number;
  aov_current:     number;
  aov_prev:        number;
  net_profit:      number;
  stripe_fees:     number;
  active_sites:    number;
}

export interface KpiStats {
  base_currency:    string;
  revenue_current:  number;
  revenue_prev:     number;
  orders_current:   number;
  orders_prev:      number;
  aov_current:      number;
  aov_prev:         number;
  net_profit:       number;
  stripe_fees:      number;
  active_sites:     number;
  // formatted
  revenue_fmt:      string;
  aov_fmt:          string;
  net_profit_fmt:   string;
  stripe_fees_fmt:  string;
  // trends (signed string, e.g. "+12.5" or "-3.2")
  trend_revenue:    string;
  trend_orders:     string;
  trend_aov:        string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

export function formatRSD(amount: number): string {
  return `€${amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function trend(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100.0" : "0.0";
  const pct = ((current - previous) / previous) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1);
}

function buildStats(raw: KpiRaw): KpiStats {
  const bc = raw.base_currency ?? "EUR";
  return {
    base_currency:   bc,
    revenue_current: raw.revenue_current,
    revenue_prev:    raw.revenue_prev,
    orders_current:  raw.orders_current,
    orders_prev:     raw.orders_prev,
    aov_current:     raw.aov_current,
    aov_prev:        raw.aov_prev,
    net_profit:      raw.net_profit,
    stripe_fees:     raw.stripe_fees,
    active_sites:    raw.active_sites,
    revenue_fmt:     formatCurrency(raw.revenue_current, bc),
    aov_fmt:         formatCurrency(raw.aov_current,     bc),
    net_profit_fmt:  formatCurrency(raw.net_profit,      bc),
    stripe_fees_fmt: formatCurrency(raw.stripe_fees,     bc),
    trend_revenue:   trend(raw.revenue_current, raw.revenue_prev),
    trend_orders:    trend(raw.orders_current,  raw.orders_prev),
    trend_aov:       trend(raw.aov_current,     raw.aov_prev),
  };
}

async function fetcher(url: string): Promise<KpiRaw> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch KPI data");
  return res.json();
}

// ── hook ───────────────────────────────────────────────────────────────────────

// forceSiteId: used by the per-site dashboard (/dashboard/[siteId]) to lock the
// site filter regardless of URL params.
export function useKpiStats(forceSiteId?: string): {
  stats: KpiStats | null;
  isLoading: boolean;
  error: Error | null;
  compareLabel: string;
} {
  const sp = useSearchParams();

  const preset        = sp.get("kpi_preset") ?? "today";
  const compare       = sp.get("kpi_compare") === "month" ? "month" : "day";
  const from          = sp.get("kpi_from");
  const to            = sp.get("kpi_to");
  const siteId        = forceSiteId ?? sp.get("kpi_site");
  const productsParam = sp.get("kpi_products");
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : [];

  const params = new URLSearchParams({ preset, compare });
  if (from)            params.set("from",     from);
  if (to)              params.set("to",       to);
  if (siteId)          params.set("siteId",   siteId);
  if (products.length) params.set("products", products.join(","));

  const url = `/api/stats/kpi?${params.toString()}`;

  const { data, error, isLoading } = useSWR<KpiRaw>(url, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  return {
    stats: data ? buildStats(data) : null,
    isLoading,
    error: error ?? null,
    compareLabel: compare === "month" ? "prošli mesec" : "juče",
  };
}
