"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { dayBounds } from "@/lib/utils/tz";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";

// ── types ──────────────────────────────────────────────────────────────────────

interface Product {
  name: string;
  type: string;
  revenue: number;
  units: number;
}

// ── custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: Product }>;
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E4E4E7",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#18181B", maxWidth: 220 }}>{p.name}</p>
      <p style={{ margin: "2px 0", color: "#52525B" }}>
        <span style={{ fontWeight: 600 }}>Prihod:</span> {formatRSD(p.revenue)}
      </p>
      <p style={{ margin: "2px 0", color: "#71717A" }}>
        <span style={{ fontWeight: 600 }}>Prodato:</span> {p.units} kom
      </p>
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────────────────

const ACCENT = "#16A34A";
const ACCENT_LIGHT = "#DCFCE7";

interface TopProductsChartProps {
  siteId?: string;
}

export function TopProductsChart({ siteId }: TopProductsChartProps) {
  // Last 30 Belgrade days (today + 29 previous) — stable key within a day.
  const params = new URLSearchParams({ limit: "10", from: dayBounds(-29).start });
  if (siteId) params.set("siteId", siteId);
  const { data, isLoading: loading, error, mutate } = useSWR<{ products: Product[] }>(
    `/api/analytics/top-products?${params}`,
    jsonFetcher
  );
  const products = data?.products ?? [];

  const chartData = products.map((p) => ({
    ...p,
    shortName: p.name.length > 28 ? p.name.slice(0, 26) + "…" : p.name,
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
          Top 10 proizvoda
        </span>
        <span style={{ fontSize: 12, color: "#A1A1AA", marginLeft: 8 }}>
          po prihodu · poslednjih 30 dana
        </span>
      </div>

      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : loading ? (
        <div style={{
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#A1A1AA",
          fontSize: 13,
        }}>
          Učitavanje…
        </div>
      ) : chartData.length === 0 ? (
        <div style={{
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#A1A1AA",
          fontSize: 13,
        }}>
          Nema podataka
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 36)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "#A1A1AA" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <YAxis
              type="category"
              dataKey="shortName"
              width={160}
              tick={{ fontSize: 11, fill: "#52525B" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: ACCENT_LIGHT }} />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={20}
              label={{
                position: "right",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter: (v: any) => formatRSD(Number(v)),
                style: { fontSize: 10, fill: "#A1A1AA" },
              }}
            >
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === 0 ? ACCENT : `rgba(22,163,74,${0.85 - i * 0.07})`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
