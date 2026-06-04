export const dynamic = "force-dynamic";

import { DailyRevenueChart } from "@/components/dashboard/charts/daily-revenue-chart";
import { StatusBreakdownChart } from "@/components/dashboard/charts/status-breakdown-chart";
import { TopProductsChart } from "@/components/dashboard/charts/top-products-chart";
import { MonthlyComparisonCard } from "@/components/dashboard/charts/monthly-comparison-card";
import { KPISection } from "@/components/dashboard/kpi-section";
import { DailyGoalTracker } from "@/components/dashboard/daily-goal-tracker";
import { ForecastingSection } from "@/components/dashboard/forecasting-section";

export default function AnalyticsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          Analitika
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
          Pregled prihoda, statusa i top proizvoda — svi sajtovi
        </p>
      </div>

      {/* Daily goal */}
      <DailyGoalTracker />

      {/* KPIs */}
      <KPISection />

      {/* Monthly comparison + Daily revenue (3:1 split) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: 16,
        alignItems: "start",
      }}>
        <DailyRevenueChart />
        <MonthlyComparisonCard />
      </div>

      {/* Status breakdown + Top products */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        alignItems: "start",
      }}>
        <StatusBreakdownChart />
        <TopProductsChart />
      </div>

      {/* Forecasting (collapsible, Beta) */}
      <ForecastingSection />

    </div>
  );
}
