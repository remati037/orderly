import { Suspense } from "react";
import { KPISection } from "@/components/dashboard/kpi-section";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { DailyGoalTracker } from "@/components/dashboard/daily-goal-tracker";
import { DailyRevenueChart } from "@/components/dashboard/charts/daily-revenue-chart";

// ── date helpers ───────────────────────────────────────────────────────────────

function todaySr(): string {
  return new Date().toLocaleDateString("sr-RS", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── page ───────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0", textTransform: "capitalize" }}>
          {todaySr()}
        </p>
      </div>

      {/* Daily goal */}
      <DailyGoalTracker />

      {/* KPIs */}
      <KPISection />

      {/* Live feed + revenue chart (2:1 split) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 16,
        alignItems: "start",
      }}>
        <LiveFeed />
        <DailyRevenueChart />
      </div>

      {/* Filter bar (sticky) + Orders table */}
      <FilterBar />

      <Suspense fallback={
        <div style={{
          background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12,
          padding: "48px 20px", textAlign: "center", color: "#A1A1AA", fontSize: 13,
        }}>
          Učitavanje porudžbina…
        </div>
      }>
        <OrdersTable searchParams={searchParams} />
      </Suspense>

    </div>
  );
}
