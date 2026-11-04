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
      background: "var(--ui-surface)",
      border: "1px solid var(--ui-border)",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--ui-text)", maxWidth: 220 }}>{p.name}</p>
      <p style={{ margin: "2px 0", color: "var(--ui-text-3)" }}>
        <span style={{ fontWeight: 600 }}>Prihod:</span> {formatRSD(p.revenue)}
      </p>
      <p style={{ margin: "2px 0", color: "var(--ui-muted)" }}>
        <span style={{ fontWeight: 600 }}>Prodato:</span> {p.units} kom
      </p>
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────────────────

const ACCENT = "var(--tone-green)";
const ACCENT_LIGHT = "var(--tone-green-2)";

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
      background: "var(--ui-surface)",
      border: "1px solid var(--ui-border)",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ui-text)" }}>
          Top 10 proizvoda
        </span>
        <span style={{ fontSize: 12, color: "var(--ui-faint)", marginLeft: 8 }}>
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
          color: "var(--ui-faint)",
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
          color: "var(--ui-faint)",
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
              tick={{ fontSize: 10, fill: "var(--ui-faint)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <YAxis
              type="category"
              dataKey="shortName"
              width={160}
              tick={{ fontSize: 11, fill: "var(--ui-text-3)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: ACCENT_LIGHT }} />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={20}
              label={{
                position: "right",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter: (v: any) => formatRSD(Number(v)),
                style: { fontSize: 10, fill: "var(--ui-faint)" },
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
