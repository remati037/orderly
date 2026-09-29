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
import { LoadError } from "./load-error";
import { useKpiStats } from "@/lib/hooks/use-kpi-stats";
import { useSparklines } from "@/lib/hooks/use-sparklines";

const dateFmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "28.09.2026. do 14:05" / "01.09.2026. – 28.09.2026." for the comparison window
// (end is exclusive, so the last included moment is end − 1ms).
function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const last = new Date(new Date(endIso).getTime() - 1);
  const endsAtMidnight = timeFmt.format(new Date(endIso)) === "00:00";
  const endLabel = endsAtMidnight ? dateFmt.format(last) : `${dateFmt.format(last)} do ${timeFmt.format(new Date(endIso))}`;
  return dateFmt.format(start) === dateFmt.format(last) ? endLabel : `${dateFmt.format(start)} – ${endLabel}`;
}

function parseTrend(signed: string): number {
  return parseFloat(signed);
}

interface KPISectionProps {
  // Passed by the per-site dashboard (/dashboard/[siteId]) to lock the site.
  // When set, filters are hidden and this siteId is used directly.
  siteId?: string;
}

export function KPISection({ siteId }: KPISectionProps) {
  const { stats, isLoading, error, retry, compareLabel } = useKpiStats(siteId);
  const { data: spark } = useSparklines(siteId);
  const loading = isLoading || (!stats && !error);

  return (
    <div>
      {/* Filters only on the main dashboard, not on site-specific pages */}
      {!siteId && <KpiFilters />}

      {stats?.prev_start && (
        <p style={{ fontSize: 12, color: "#A1A1AA", margin: "0 0 10px" }}>
          Poređeno sa: {formatRange(stats.prev_start, stats.prev_end)}
        </p>
      )}

      {error && !stats && (
        <div style={{ marginBottom: 12 }}>
          <LoadError onRetry={retry} compact />
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard
          label="Prihod"
          value={stats?.revenue_fmt ?? "—"}
          trend={stats ? parseTrend(stats.trend_revenue) : null}
          icon={TrendingUpIcon}
          isLoading={loading}
          sparkline={spark?.revenue}
          compareLabel={compareLabel}
        />
        <KPICard
          label="Porudžbine"
          value={stats ? String(stats.orders_current) : "—"}
          trend={stats ? parseTrend(stats.trend_orders) : null}
          icon={ShoppingBagIcon}
          isLoading={loading}
          sparkline={spark?.orders}
          compareLabel={compareLabel}
        />
        <KPICard
          label="AOV"
          value={stats?.aov_fmt ?? "—"}
          trend={stats ? parseTrend(stats.trend_aov) : null}
          icon={ReceiptIcon}
          isLoading={loading}
          sparkline={spark?.aov}
          compareLabel={compareLabel}
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
