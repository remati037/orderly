"use client";

import useSWR from "swr";
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";
import { LoadError } from "@/components/dashboard/load-error";

function monthName(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toLocaleDateString("sr-RS", { month: "long", year: "numeric" });
}

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  return res.json() as Promise<{
    revenue_current: number;
    revenue_prev: number;
    revenue_prev_same_period: number | null;
  }>;
}

interface MonthlyComparisonCardProps {
  siteId?: string;
}

export function MonthlyComparisonCard({ siteId }: MonthlyComparisonCardProps) {
  const url = siteId
    ? `/api/stats/kpi?preset=this_month&siteId=${siteId}`
    : "/api/stats/kpi?preset=this_month";
  const { data, isLoading, error, mutate } = useSWR(url, fetcher, { refreshInterval: 30_000 });

  if (error && !data) return <LoadError onRetry={() => mutate()} />;

  if (isLoading || !data) {
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

  const current = data.revenue_current;
  const previous = data.revenue_prev;
  // Comparing today's partial month against a full previous month always
  // looks like a crash early in the month — the trend % and progress bar
  // use the same-elapsed-days figure instead. revenue_prev (full month)
  // still drives the "last month" column, since that total is what it is.
  const previousFair = data.revenue_prev_same_period ?? previous;
  const pct = previousFair === 0
    ? (current > 0 ? 100 : 0)
    : ((current - previousFair) / previousFair) * 100;
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
          <p
            title={data.revenue_prev_same_period !== null
              ? `${monthName(-1)} do istog dana: ${formatRSD(data.revenue_prev_same_period)}`
              : undefined}
            style={{
              fontSize: 22, fontWeight: 700, color: "#18181B", margin: 0, letterSpacing: "-0.02em",
              cursor: data.revenue_prev_same_period !== null ? "help" : "default",
            }}
          >
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
          {data.revenue_prev_same_period !== null ? "vs. prošlog meseca do sada" : "vs. prošlog meseca"}
        </span>
      </div>

      {/* mini progress vs last month, same elapsed period */}
      {previousFair > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 4, borderRadius: 99, background: "#F4F4F5", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (current / previousFair) * 100)}%`,
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
