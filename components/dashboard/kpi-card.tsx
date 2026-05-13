"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ── skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-zinc-100", className)} />
  );
}

// ── trend badge ────────────────────────────────────────────────────────────────

function TrendBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 99,
        marginTop: 8,
        background: positive ? "#F0FDF4" : "#FEF2F2",
        color: positive ? "#16A34A" : "#DC2626",
      }}
    >
      {positive ? "↑" : "↓"}&nbsp;{Math.abs(value).toFixed(1)}%
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
}

export function KPICard({
  label,
  value,
  trend,
  icon: Icon,
  isLoading,
}: KPICardProps) {
  return (
    <div
      className="group"
      style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 12,
        padding: "20px 22px",
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
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#71717A",
            }}
          >
            {label}
          </span>
        )}
        <Icon style={{ width: 16, height: 16, color: "#A1A1AA", flexShrink: 0 }} />
      </div>

      {/* Value */}
      <div style={{ marginTop: 6 }}>
        {isLoading ? (
          <Skeleton className="h-8 w-32 mt-1" />
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
      </div>

      {/* Trend */}
      {isLoading ? (
        <Skeleton className="h-5 w-16 mt-2" />
      ) : (
        trend !== null && <TrendBadge value={trend} />
      )}
    </div>
  );
}
