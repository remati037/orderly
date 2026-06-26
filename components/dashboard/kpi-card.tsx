"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

// ── skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-zinc-100", className)} />
  );
}

// ── trend text ─────────────────────────────────────────────────────────────────

function TrendText({ value, compareLabel }: { value: number; compareLabel: string }) {
  const positive = value >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: positive ? "#16A34A" : "#DC2626" }}>
        {positive ? "↑" : "↓"} {Math.abs(value).toFixed(1)}%
      </span>
      <span style={{ color: "#A1A1AA" }}>vs {compareLabel}</span>
    </span>
  );
}

// ── card ───────────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  trend: number | null;
  icon: LucideIcon;
  isLoading: boolean;
  sparkline?: number[];
  compareLabel?: string;
}

export function KPICard({
  label,
  value,
  trend,
  icon: Icon,
  isLoading,
  sparkline,
  compareLabel = "juče",
}: KPICardProps) {
  const sparkColor = trend == null || trend >= 0 ? "#16A34A" : "#DC2626";
  return (
    <div
      className="group"
      style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 14,
        padding: "18px 20px",
        boxShadow: "var(--shadow-sm)",
        transition: "box-shadow 180ms cubic-bezier(0.4,0,0.2,1), transform 180ms cubic-bezier(0.4,0,0.2,1), border-color 180ms cubic-bezier(0.4,0,0.2,1)",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.boxShadow = "var(--shadow-md)";
        el.style.transform = "translateY(-1px)";
        el.style.borderColor = "#D1D1D6";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.boxShadow = "var(--shadow-sm)";
        el.style.transform = "translateY(0)";
        el.style.borderColor = "#E4E4E7";
      }}
    >
      {/* Top row: icon chip + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "#DCFCE7",
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 16, height: 16, color: "#16A34A" }} />
        </span>
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#71717A",
            }}
          >
            {label}
          </span>
        )}
      </div>

      {/* Value + trend on the left, 7-day sparkline on the right */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          {/* Value */}
          {isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <span
              style={{
                display: "block",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "#18181B",
                lineHeight: 1.1,
              }}
            >
              {value}
            </span>
          )}

          {/* Trend */}
          {isLoading ? (
            <Skeleton className="h-5 w-28 mt-2" />
          ) : (
            trend !== null && <TrendText value={trend} compareLabel={compareLabel} />
          )}
        </div>

        {/* Sparkline */}
        {!isLoading && sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={sparkColor} />
        )}
      </div>
    </div>
  );
}
