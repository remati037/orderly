"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";

const STYLES = `
@keyframes dgt-spring {
  0%   { width: 0% }
  60%  { width: calc(var(--dgt-pct) * 1.06) }
  80%  { width: calc(var(--dgt-pct) * 0.97) }
  100% { width: var(--dgt-pct) }
}
`;

interface GoalResponse {
  value: string | null;
}

async function fetchGoal(url: string): Promise<GoalResponse> {
  const res = await fetch(url);
  if (!res.ok) return { value: null };
  return res.json();
}

interface DailyGoalTrackerProps {
  siteId?: string;
}

async function fetchTodayRevenue(url: string): Promise<{ revenue_current: number }> {
  const res = await fetch(url);
  if (!res.ok) return { revenue_current: 0 };
  return res.json();
}

export function DailyGoalTracker({ siteId }: DailyGoalTrackerProps) {
  const [animated, setAnimated] = useState(false);

  const kpiUrl = siteId
    ? `/api/stats/kpi?preset=today&siteId=${siteId}`
    : "/api/stats/kpi?preset=today";
  const { data: kpiData, isLoading } = useSWR(kpiUrl, fetchTodayRevenue, {
    refreshInterval: 30_000,
  });

  const goalKey = siteId ? `goal_daily_site_${siteId}` : "goal_daily_global";
  const { data: goalData, isLoading: goalLoading } = useSWR<GoalResponse>(
    `/api/settings?key=${goalKey}`,
    fetchGoal,
    { revalidateOnFocus: false }
  );

  const goal = goalData?.value ? Number(goalData.value) : null;
  const current = kpiData?.revenue_current ?? 0;
  const pct = goal ? Math.min(100, (current / goal) * 100) : 0;
  const reached = goal !== null && current >= goal;
  const remaining = goal !== null ? goal - current : 0;

  useEffect(() => {
    if (!isLoading && !goalLoading && goal !== null) {
      const t = setTimeout(() => setAnimated(true), 80);
      return () => clearTimeout(t);
    }
  }, [isLoading, goalLoading, goal]);

  if ((isLoading && !kpiData) || goalLoading) {
    return (
      <div style={{
        background: "#fff", border: "1px solid #E4E4E7", borderRadius: 10,
        padding: "12px 16px", display: "flex", alignItems: "center", gap: 16,
      }}>
        <div className="animate-pulse h-3 w-28 rounded-md bg-zinc-100" />
        <div className="animate-pulse h-2 flex-1 rounded-full bg-zinc-100" />
        <div className="animate-pulse h-3 w-16 rounded-md bg-zinc-100" />
      </div>
    );
  }

  if (goal === null) {
    return (
      <div style={{
        background: "#fff", border: "1px solid #E4E4E7", borderRadius: 10,
        padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#71717A", flexShrink: 0 }}>
          Dnevni cilj
        </span>
        <span style={{ fontSize: 12, color: "#A1A1AA" }}>
          Podesi cilj u{" "}
          <Link href="/settings/sites" style={{ color: "#1B6EF3", textDecoration: "underline" }}>
            Podešavanjima
          </Link>
        </span>
      </div>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        {/* label */}
        <span style={{ fontSize: 12, fontWeight: 600, color: "#71717A", whiteSpace: "nowrap", flexShrink: 0 }}>
          Dnevni cilj
        </span>

        {/* bar */}
        <div style={{ flex: 1, height: 6, borderRadius: 99, background: "#F4F4F5", overflow: "hidden", minWidth: 60 }}>
          <div
            style={{
              height: "100%",
              borderRadius: 99,
              background: reached ? "#16A34A" : "#1B6EF3",
              ["--dgt-pct" as string]: `${pct}%`,
              width: animated ? `${pct}%` : "0%",
              animation: animated ? "dgt-spring 700ms cubic-bezier(0.34,1.56,0.64,1) forwards" : undefined,
            }}
          />
        </div>

        {/* values */}
        <span style={{ fontSize: 12, color: "#52525B", whiteSpace: "nowrap", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, color: reached ? "#16A34A" : "#18181B" }}>
            {formatRSD(current)}
          </span>
          <span style={{ color: "#A1A1AA" }}> / {formatRSD(goal)}</span>
        </span>

        {/* status text */}
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flexShrink: 0,
          background: reached ? "#F0FDF4" : "#EBF2FF",
          color: reached ? "#16A34A" : "#1B6EF3",
          whiteSpace: "nowrap",
        }}>
          {reached
            ? "Cilj ostvaren! 🎉"
            : `${formatRSD(remaining)} do cilja`}
        </span>
      </div>
    </>
  );
}
