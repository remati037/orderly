import { Suspense } from "react";
import { KPISection } from "@/components/dashboard/kpi-section";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { DailyGoalTracker } from "@/components/dashboard/daily-goal-tracker";

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

export default function DashboardPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0", textTransform: "capitalize" }} suppressHydrationWarning>
          {todaySr()}
        </p>
      </div>

      {/* Daily goal */}
      <DailyGoalTracker />

      {/* KPIs (respect the filter) */}
      <Suspense fallback={<div style={{ height: 120, background: "#F4F4F5", borderRadius: 12, animation: "pulse 2s infinite" }} />}>
        <KPISection />
      </Suspense>

      {/* Live feed — full width, follows the site/product filter */}
      <Suspense fallback={<div style={{ height: 200, background: "#F4F4F5", borderRadius: 12, animation: "pulse 2s infinite" }} />}>
        <LiveFeed />
      </Suspense>

    </div>
  );
}
