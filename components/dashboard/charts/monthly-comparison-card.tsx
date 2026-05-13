"use client";

import { TrendingUpIcon, TrendingDownIcon } from "lucide-react";
import { useKpiStats, formatRSD } from "@/lib/hooks/use-kpi-stats";
import { cn } from "@/lib/utils";

function monthName(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString("sr-RS", { month: "long", year: "numeric" });
}

interface MonthlyComparisonCardProps {
  siteId?: string;
}

export function MonthlyComparisonCard({ siteId }: MonthlyComparisonCardProps) {
  const { stats, isLoading } = useKpiStats(siteId);

  if (isLoading || !stats) {
    return (
      <div style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 12,
        padding: "18px 20px",
      }}>
        <div className="animate-pulse h-4 w-40 rounded-md bg-zinc-100 mb-4" />
        <div className="animate-pulse h-8 w-48 rounded-md bg-zinc-100 mb-2" />
        <div className="animate-pulse h-4 w-32 rounded-md bg-zinc-100" />
      </div>
    );
  }

  const current = stats.revenue_month;
  const previous = stats.revenue_last_month;
  const pct = previous === 0
    ? (current > 0 ? 100 : 0)
    : ((current - previous) / previous) * 100;
  const positive = pct >= 0;
  const absPct = Math.abs(pct);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E4E4E7",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "#71717A" }}>
        Mesečno poređenje
      </span>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* this month */}
        <div>
          <p style={{ fontSize: 11, color: "#A1A1AA", margin: "0 0 4px", textTransform: "capitalize" }}>
            {monthName(0)}
          </p>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#18181B", margin: 0, letterSpacing: "-0.02em" }}>
            {formatRSD(current)}
          </p>
        </div>

        {/* last month */}
        <div>
          <p style={{ fontSize: 11, color: "#A1A1AA", margin: "0 0 4px", textTransform: "capitalize" }}>
            {monthName(-1)}
          </p>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#71717A", margin: 0, letterSpacing: "-0.02em" }}>
            {formatRSD(previous)}
          </p>
        </div>
      </div>

      {/* change badge */}
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          fontWeight: 700,
          padding: "3px 10px",
          borderRadius: 99,
          background: positive ? "#F0FDF4" : "#FEF2F2",
          color: positive ? "#16A34A" : "#DC2626",
        }}>
          {positive
            ? <TrendingUpIcon style={{ width: 14, height: 14 }} />
            : <TrendingDownIcon style={{ width: 14, height: 14 }} />}
          {positive ? "+" : "-"}{absPct.toFixed(1)}%
        </span>
        <span style={{ fontSize: 12, color: "#A1A1AA" }}>
          vs. prošlog meseca
        </span>
      </div>

      {/* mini progress vs last month */}
      {previous > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 4, borderRadius: 99, background: "#F4F4F5", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (current / previous) * 100)}%`,
              borderRadius: 99,
              background: positive ? "#16A34A" : "#DC2626",
              transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
