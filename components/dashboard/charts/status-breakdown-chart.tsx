"use client";

import { useEffect, useState, useCallback } from "react";
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
  processing: { label: "Processing",  color: "#D97706" },
  completed:  { label: "Completed",   color: "#16A34A" },
  pending:    { label: "Pending",     color: "#6366F1" },
  cancelled:  { label: "Cancelled",   color: "#71717A" },
  refunded:   { label: "Refunded",    color: "#E11D48" },
  "on-hold":  { label: "On hold",     color: "#C2410C" },
  failed:     { label: "Failed",      color: "#DC2626" },
};

const FALLBACK_COLORS = ["#16A34A", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#6B7280"];

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
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fill: "#52525B" }}>
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
  const [data, setData] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("siteId", siteId);
      const res = await fetch(`/api/analytics/status-breakdown?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const pieData = (data?.breakdown ?? []).map((item, i) => ({
    name: STATUS_CONFIG[item.status]?.label ?? item.status,
    value: item.count,
    pct: item.pct,
    color: STATUS_CONFIG[item.status]?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E4E4E7",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
          Status porudžbina
        </span>
        {data && (
          <span style={{ fontSize: 12, color: "#A1A1AA", marginLeft: 8 }}>
            {data.total.toLocaleString("sr-RS")} ukupno
          </span>
        )}
      </div>

      {loading ? (
        <div style={{
          height: 260,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#A1A1AA",
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
          color: "#A1A1AA",
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
                background: "#fff",
                border: "1px solid #E4E4E7",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: "#52525B" }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
