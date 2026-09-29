"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { TooltipBox, compactMoney } from "@/components/dashboard/analytics/chart-kit";
import { chartColor, orderForSeparation } from "@/lib/utils/chart-color";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { LineChartIcon, BarChart3Icon } from "lucide-react";
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
  base_currency?: string;
}


// ── custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.find((p) => p.name === "Ukupno");
  const rows = payload
    .filter((p) => p.name !== "Ukupno")
    .map((p) => ({ key: p.name, label: p.name, color: p.color, value: formatRSD(p.value) }));
  return <TooltipBox title={String(label)} rows={rows} footer={total ? `Ukupno: ${formatRSD(total.value)}` : undefined} />;
}

// Legend text stays in neutral ink; the swatch carries the series colour.
const legendText = (value: string) => <span style={{ color: "#52525B" }}>{value}</span>;

// ── component ──────────────────────────────────────────────────────────────────

interface DailyRevenueChartProps {
  siteId?: string;
}

export function DailyRevenueChart({ siteId }: DailyRevenueChartProps) {
  const [days, setDays] = useState(30);
  const [hiddenSites, setHiddenSites] = useState<Set<string>>(new Set());
  const [chartType, setChartType] = useState<"line" | "bar">("line");

  const params = new URLSearchParams({ days: String(days) });
  if (siteId) params.set("siteId", siteId);
  const { data, isLoading: loading, error, mutate } = useSWR<RevenueData>(
    `/api/analytics/daily-revenue?${params}`,
    jsonFetcher,
    { keepPreviousData: true }
  );

  // Chart-safe site colours, ordered so neighbouring series stay distinct.
  const series = useMemo(
    () => orderForSeparation((data?.series ?? []).map((s) => ({ ...s, color: chartColor(s.color) })), (s) => s.color),
    [data]
  );

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
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
          Dnevni prihod
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {([
              { type: "line" as const, label: "Linija", icon: LineChartIcon },
              { type: "bar" as const, label: "Stubici", icon: BarChart3Icon },
            ]).map((o) => (
              <button
                key={o.type}
                onClick={() => setChartType(o.type)}
                title={o.label}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6,
                  border: "1px solid", cursor: "pointer",
                  background: chartType === o.type ? "#16A34A" : "transparent",
                  borderColor: chartType === o.type ? "#16A34A" : "#E4E4E7",
                  color: chartType === o.type ? "#fff" : "#71717A",
                  transition: "all 120ms",
                }}
              >
                <o.icon style={{ width: 12, height: 12 }} />
              </button>
            ))}
          </div>
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
                background: days === p.value ? "#16A34A" : "transparent",
                borderColor: days === p.value ? "#16A34A" : "#E4E4E7",
                color: days === p.value ? "#fff" : "#71717A",
                transition: "all 120ms",
              }}
            >
              {p.label}
            </button>
            ))}
          </div>
        </div>
      </div>

      {/* chart */}
      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : loading ? (
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
      ) : chartType === "bar" ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
              tickFormatter={(v) => compactMoney(v, data?.base_currency ?? "EUR")}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
            <Legend
              onClick={handleLegendClick}
              wrapperStyle={{ fontSize: 12, cursor: "pointer", paddingTop: 8 }}
              formatter={legendText}
            />
            {series.map((s) => (
              <Bar
                key={s.siteId}
                stackId="revenue"
                dataKey={s.name}
                fill={s.color}
                hide={hiddenSites.has(s.name)}
                radius={0}
                maxBarSize={24}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
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
              tickFormatter={(v) => compactMoney(v, data?.base_currency ?? "EUR")}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#E4E4E7", strokeWidth: 1 }} />
            <Legend
              onClick={handleLegendClick}
              wrapperStyle={{ fontSize: 12, cursor: "pointer", paddingTop: 8 }}
              formatter={legendText}
            />
            {series.map((s) => (
              <Line
                key={s.siteId}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                hide={hiddenSites.has(s.name)}
                activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              />
            ))}
            {!siteId && (
              <Line
                type="monotone"
                dataKey="Ukupno"
                stroke="#18181B"
                strokeWidth={2}
                dot={false}
                hide={hiddenSites.has("Ukupno")}
                activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
