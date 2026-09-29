export const dynamic = "force-dynamic";

import { DailyRevenueChart } from "@/components/dashboard/charts/daily-revenue-chart";
import { StatusBreakdownChart } from "@/components/dashboard/charts/status-breakdown-chart";
import { TopProductsChart } from "@/components/dashboard/charts/top-products-chart";
import { MonthlyComparisonCard } from "@/components/dashboard/charts/monthly-comparison-card";
import { KPISection } from "@/components/dashboard/kpi-section";
import { DailyGoalTracker } from "@/components/dashboard/daily-goal-tracker";
import { ForecastingSection } from "@/components/dashboard/forecasting-section";
import { SitePerformance } from "@/components/dashboard/analytics/site-performance";
import { TrendsSection } from "@/components/dashboard/analytics/trends-section";
import { Suspense } from "react";

export default function AnalyticsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          Analitika
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
          Prihod po sajtovima, trendovi, kupci i naplata
        </p>
      </div>

      {/* Daily goal */}
      <DailyGoalTracker />

      {/* KPIs */}
      <KPISection />

      {/* Revenue per site for the selected period */}
      <Suspense fallback={null}>
        <SitePerformance />
      </Suspense>

      {/* Monthly comparison + Daily revenue (3:1 split) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ gap: 16, alignItems: "start" }}>
        <DailyRevenueChart />
        <MonthlyComparisonCard />
      </div>

      {/* Month-by-month trends (one fetch, own 3/6/12-month selector) */}
      <Suspense fallback={null}>
        <TrendsSection />
      </Suspense>

      {/* Status breakdown + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, alignItems: "start" }}>
        <StatusBreakdownChart />
        <TopProductsChart />
      </div>

      {/* Forecasting (collapsible, Beta) */}
      <ForecastingSection />

    </div>
  );
}
