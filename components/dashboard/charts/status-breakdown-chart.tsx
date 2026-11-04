"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

// ── status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  processing: { label: "Processing",  color: "var(--tone-amber)" },
  completed:  { label: "Completed",   color: "var(--tone-green)" },
  pending:    { label: "Pending",     color: "var(--tone-indigo)" },
  cancelled:  { label: "Cancelled",   color: "var(--ui-muted)" },
  refunded:   { label: "Refunded",    color: "var(--tone-rose)" },
  "on-hold":  { label: "On hold",     color: "var(--tone-orange-strong)" },
  failed:     { label: "Failed",      color: "var(--tone-red)" },
};

const FALLBACK_COLORS = ["var(--tone-green)", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "var(--ui-muted)"];

interface BreakdownItem {
  status: string;
  count: number;
  pct: number;
}

interface BreakdownData {
  breakdown: BreakdownItem[];
  total: number;
}

// ── custom label ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, count, pct } = props as {
    cx: number; cy: number; midAngle: number; outerRadius: number; count: number; pct: number;
  };
  if (!pct || pct < 5) return null;
  const RAD = Math.PI / 180;
  const x = cx + (outerRadius + 20) * Math.cos(-midAngle * RAD);
  const y = cy + (outerRadius + 20) * Math.sin(-midAngle * RAD);
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fill: "var(--ui-text-3)" }}>
      <tspan fontWeight={700}>{count}</tspan>
      {" "}
      <tspan>({pct}%)</tspan>
    </text>
  );
}

// ── component ──────────────────────────────────────────────────────────────────

interface StatusBreakdownChartProps {
  siteId?: string;
}

export function StatusBreakdownChart({ siteId }: StatusBreakdownChartProps) {
  const params = new URLSearchParams();
  if (siteId) params.set("siteId", siteId);
  const { data, isLoading: loading, error, mutate } = useSWR<BreakdownData>(
    `/api/analytics/status-breakdown?${params}`,
    jsonFetcher
  );

  const pieData = (data?.breakdown ?? []).map((item, i) => ({
    name: STATUS_CONFIG[item.status]?.label ?? item.status,
    value: item.count,
    pct: item.pct,
    color: STATUS_CONFIG[item.status]?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  return (
    <div style={{
      background: "var(--ui-surface)",
      border: "1px solid var(--ui-border)",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ui-text)" }}>
          Status porudžbina
        </span>
        {data && (
          <span style={{ fontSize: 12, color: "var(--ui-faint)", marginLeft: 8 }}>
            {data.total.toLocaleString("sr-RS")} ukupno
          </span>
        )}
      </div>

      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : loading ? (
        <div style={{
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ui-faint)",
          fontSize: 13,
        }}>
          Učitavanje…
        </div>
      ) : pieData.length === 0 ? (
        <div style={{
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ui-faint)",
          fontSize: 13,
        }}>
          Nema podataka
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="45%"
              innerRadius="50%"
              outerRadius="72%"
              dataKey="value"
              labelLine={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={(props: any) => <CustomLabel {...props} count={props.value} pct={props.pct} />}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [`${value} porudžbina`, name]}
              contentStyle={{
                background: "var(--ui-surface)",
                border: "1px solid var(--ui-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: "var(--ui-text-3)" }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
