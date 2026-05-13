"use client";

import {
  TrendingUpIcon,
  CalendarIcon,
  ShoppingBagIcon,
  ReceiptIcon,
  CircleDollarSignIcon,
} from "lucide-react";
import { KPICard } from "./kpi-card";
import { useKpiStats } from "@/lib/hooks/use-kpi-stats";

function parseTrend(signed: string): number {
  return parseFloat(signed);
}

function monthTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

interface KPISectionProps {
  siteId?: string;
}

export function KPISection({ siteId }: KPISectionProps) {
  const { stats, isLoading } = useKpiStats(siteId);

  const loading = isLoading || !stats;

  return (
    <div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KPICard
          label="Prihod danas"
          value={stats?.revenue_today_fmt ?? "—"}
          trend={stats ? parseTrend(stats.trend_revenue) : null}
          icon={TrendingUpIcon}
          isLoading={loading}
        />
        <KPICard
          label="Prihod mesec"
          value={stats?.revenue_month_fmt ?? "—"}
          trend={
            stats
              ? monthTrend(stats.revenue_month, stats.revenue_last_month)
              : null
          }
          icon={CalendarIcon}
          isLoading={loading}
        />
        <KPICard
          label="Porudžbine danas"
          value={stats ? String(stats.orders_today) : "—"}
          trend={stats ? parseTrend(stats.trend_orders) : null}
          icon={ShoppingBagIcon}
          isLoading={loading}
        />
        <KPICard
          label="AOV"
          value={stats?.aov_today_fmt ?? "—"}
          trend={null}
          icon={ReceiptIcon}
          isLoading={loading}
        />
        <KPICard
          label="Neto zarada"
          value={stats?.net_profit_today_fmt ?? "—"}
          trend={null}
          icon={CircleDollarSignIcon}
          isLoading={loading}
        />
      </div>
    </div>
  );
}
