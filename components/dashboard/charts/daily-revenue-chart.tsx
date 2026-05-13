"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";

// ── types ──────────────────────────────────────────────────────────────────────

interface Series {
  siteId: string;
  name: string;
  color: string;
  data: number[];
}

interface RevenueData {
  labels: string[];
  series: Series[];
  totals: number[];
}

// ── date picker helpers ────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nDaysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n + 1);
  return d.toISOString().split("T")[0];
}

// ── custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E4E4E7",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#18181B" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ margin: "2px 0", color: p.color }}>
          <span style={{ fontWeight: 600 }}>{p.name}:</span>{" "}
          {formatRSD(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────────────────

interface DailyRevenueChartProps {
  siteId?: string;
}

export function DailyRevenueChart({ siteId }: DailyRevenueChartProps) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hiddenSites, setHiddenSites] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (siteId) params.set("siteId", siteId);
      const res = await fetch(`/api/analytics/daily-revenue?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [days, siteId]);

  useEffect(() => { load(); }, [load]);

  const chartData = data
    ? data.labels.map((label, i) => {
        const point: Record<string, string | number> = { date: label };
        for (const s of data.series) {
          point[s.name] = s.data[i];
        }
        point["Ukupno"] = data.totals[i];
        return point;
      })
    : [];

  const handleLegendClick = (e: { dataKey?: string | number | ((obj: unknown) => unknown) }) => {
    const key = typeof e.dataKey === "string" ? e.dataKey : undefined;
    if (!key) return;
    setHiddenSites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const PRESETS = [
    { label: "7 dana", value: 7 },
    { label: "30 dana", value: 30 },
    { label: "60 dana", value: 60 },
    { label: "90 dana", value: 90 },
  ];

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E4E4E7",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      {/* header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
          Dnevni prihod
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid",
                cursor: "pointer",
                background: days === p.value ? "#1B6EF3" : "transparent",
                borderColor: days === p.value ? "#1B6EF3" : "#E4E4E7",
                color: days === p.value ? "#fff" : "#71717A",
                transition: "all 120ms",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* chart */}
      {loading ? (
        <div style={{
          height: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#A1A1AA",
          fontSize: 13,
        }}>
          Učitavanje…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#F4F4F5" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#A1A1AA" }}
              axisLine={false}
              tickLine={false}
              interval={Math.floor((chartData.length - 1) / 6)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#A1A1AA" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              onClick={handleLegendClick}
              wrapperStyle={{ fontSize: 12, cursor: "pointer", paddingTop: 8 }}
            />
            {(data?.series ?? []).map((s) => (
              <Line
                key={s.siteId}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                hide={hiddenSites.has(s.name)}
                activeDot={{ r: 4 }}
              />
            ))}
            {!siteId && (
              <Line
                type="monotone"
                dataKey="Ukupno"
                stroke="#18181B"
                strokeWidth={3}
                dot={false}
                hide={hiddenSites.has("Ukupno")}
                activeDot={{ r: 5 }}
                strokeDasharray="0"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
