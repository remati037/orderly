"use client";

import {
  TrendingUpIcon,
  ShoppingBagIcon,
  ReceiptIcon,
  CircleDollarSignIcon,
  CreditCardIcon,
  GlobeIcon,
} from "lucide-react";
import { KPICard } from "./kpi-card";
import { KpiFilters } from "./kpi-filters";
import { useKpiStats } from "@/lib/hooks/use-kpi-stats";

function parseTrend(signed: string): number {
  return parseFloat(signed);
}

interface KPISectionProps {
  // Passed by the per-site dashboard (/dashboard/[siteId]) to lock the site.
  // When set, filters are hidden and this siteId is used directly.
  siteId?: string;
}

export function KPISection({ siteId }: KPISectionProps) {
  const { stats, isLoading } = useKpiStats(siteId);
  const loading = isLoading || !stats;

  return (
    <div>
      {/* Filters only on the main dashboard, not on site-specific pages */}
      {!siteId && <KpiFilters />}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard
          label="Prihod"
          value={stats?.revenue_fmt ?? "—"}
          trend={stats ? parseTrend(stats.trend_revenue) : null}
          icon={TrendingUpIcon}
          isLoading={loading}
        />
        <KPICard
          label="Porudžbine"
          value={stats ? String(stats.orders_current) : "—"}
          trend={stats ? parseTrend(stats.trend_orders) : null}
          icon={ShoppingBagIcon}
          isLoading={loading}
        />
        <KPICard
          label="AOV"
          value={stats?.aov_fmt ?? "—"}
          trend={stats ? parseTrend(stats.trend_aov) : null}
          icon={ReceiptIcon}
          isLoading={loading}
        />
        <KPICard
          label="Neto zarada"
          value={stats?.net_profit_fmt ?? "—"}
          trend={null}
          icon={CircleDollarSignIcon}
          isLoading={loading}
        />
        <KPICard
          label="Stripe naknade"
          value={stats?.stripe_fees_fmt ?? "—"}
          trend={null}
          icon={CreditCardIcon}
          isLoading={loading}
        />
        <KPICard
          label="Aktivni sajtovi"
          value={stats ? String(stats.active_sites) : "—"}
          trend={null}
          icon={GlobeIcon}
          isLoading={loading}
        />
      </div>
    </div>
  );
}
