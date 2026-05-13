"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, FlaskConicalIcon } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ForecastData {
  historical_labels: string[];
  historical_values: number[];
  smoothed_values: number[];
  forecast_labels: string[];
  forecast_values: number[];
  projected_month_revenue: number;
}

interface CohortRow {
  month: string;
  cohort_month: string;
  size: number;
  m1: number | null;
  m2: number | null;
  m3: number | null;
}

// ── Cohort cell ───────────────────────────────────────────────────────────────

function cohortCellStyle(pct: number | null): React.CSSProperties {
  if (pct === null || pct === 0) return { background: "#F9FAFB", color: "#A1A1AA" };
  if (pct >= 60) return { background: "#15803D", color: "#fff" };
  if (pct >= 40) return { background: "#22C55E", color: "#fff" };
  if (pct >= 20) return { background: "#BBF7D0", color: "#166534" };
  return { background: "#DCFCE7", color: "#166534" };
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#18181B" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ margin: "2px 0", color: p.color }}>
          <span style={{ fontWeight: 600 }}>{p.name}:</span> {formatRSD(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ForecastingSection() {
  const [open, setOpen] = useState(false);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [cohort, setCohort] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const [forecastRes, cohortRes] = await Promise.all([
        fetch("/api/analytics/forecast"),
        fetch("/api/analytics/cohort"),
      ]);
      const [fd, cd] = await Promise.all([
        forecastRes.json(),
        cohortRes.json(),
      ]);
      setForecast(fd);
      setCohort(cd.rows ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [loaded]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  // Build chart data: last 60 historical days + 30 forecast days
  const chartData = (() => {
    if (!forecast) return [];
    const SHOW_HISTORY = 60;
    const hLabels = forecast.historical_labels.slice(-SHOW_HISTORY);
    const hValues = forecast.historical_values.slice(-SHOW_HISTORY);
    const fLabels = forecast.forecast_labels;
    const fValues = forecast.forecast_values;

    // Historical points
    const points = hLabels.map((label, i) => ({
      date: label,
      actual: Math.round(hValues[i]),
      forecast: null as number | null,
    }));

    // Bridge: last historical point is also first forecast point for continuity
    if (points.length > 0) {
      points[points.length - 1].forecast = points[points.length - 1].actual;
    }

    // Forecast points
    fLabels.forEach((label, i) => {
      points.push({
        date: label,
        actual: null as unknown as number,
        forecast: Math.round(fValues[i]),
      });
    });

    return points;
  })();

  // Show every Nth label to avoid clutter (90 points total)
  const labelInterval = Math.floor(chartData.length / 8);

  return (
    <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, overflow: "hidden" }}>

      {/* Header / toggle */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
            Prognoza prihoda
          </span>
          {/* Beta badge */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            padding: "2px 7px", borderRadius: 99,
            background: "#F3E8FF", color: "#7C3AED",
            textTransform: "uppercase",
          }}>
            <FlaskConicalIcon style={{ width: 10, height: 10 }} />
            Beta
          </span>
        </div>
        {open ? (
          <ChevronUpIcon style={{ width: 16, height: 16, color: "#A1A1AA" }} />
        ) : (
          <ChevronDownIcon style={{ width: 16, height: 16, color: "#A1A1AA" }} />
        )}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #F4F4F5", padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {loading ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", fontSize: 13 }}>
              Računam prognozu…
            </div>
          ) : (
            <>
              {/* Projection card + disclaimer */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                {forecast && (
                  <div style={{
                    background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10,
                    padding: "14px 18px", flexShrink: 0,
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#166534", margin: 0 }}>
                      Projektovani prihod ovog meseca
                    </p>
                    <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#15803D", margin: "4px 0 0", lineHeight: 1.2 }}>
                      {formatRSD(forecast.projected_month_revenue)}
                    </p>
                  </div>
                )}
                <p style={{ fontSize: 12, color: "#A1A1AA", margin: 0, maxWidth: 420, lineHeight: 1.6, paddingTop: 4 }}>
                  ⚠️ Prognoza je okvirna i bazirana na istorijskim trendovima (Holt exponential smoothing, α=0.3, β=0.1).
                  Ne uzima u obzir sezonalnost niti spoljne faktore.
                </p>
              </div>

              {/* Forecast chart */}
              <div>
                <p style={{ fontSize: 12, color: "#71717A", margin: "0 0 12px" }}>
                  Poslednih 60 dana (puna linija) + prognoza za sledećih 30 dana (isprekidana linija)
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F4F4F5" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#A1A1AA" }}
                      axisLine={false}
                      tickLine={false}
                      interval={labelInterval}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#A1A1AA" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                      width={32}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Stvarni prihod"
                      stroke="#1B6EF3"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3 }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Prognoza"
                      stroke="#1B6EF3"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      strokeOpacity={0.55}
                      dot={false}
                      activeDot={{ r: 3 }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Cohort retention table */}
              {cohort.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#18181B", margin: "0 0 10px" }}>
                    Cohort retencija kupaca
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                      <thead>
                        <tr>
                          {["Kohorta", "Veličina", "Mesec 1", "Mesec 2", "Mesec 3"].map((h) => (
                            <th key={h} style={{
                              padding: "8px 14px", textAlign: h === "Veličina" || h.startsWith("Mesec") ? "center" : "left",
                              fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                              color: "#A1A1AA", borderBottom: "1px solid #F4F4F5", whiteSpace: "nowrap",
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cohort.map((row) => (
                          <tr key={row.cohort_month} style={{ borderBottom: "1px solid #F4F4F5" }}>
                            <td style={{ padding: "8px 14px", fontWeight: 500, color: "#18181B" }}>
                              {row.month}
                            </td>
                            <td style={{ padding: "8px 14px", textAlign: "center", color: "#52525B" }}>
                              {row.size}
                            </td>
                            {([row.m1, row.m2, row.m3] as (number | null)[]).map((pct, i) => (
                              <td
                                key={i}
                                style={{
                                  padding: "8px 14px",
                                  textAlign: "center",
                                  fontWeight: pct !== null && pct > 0 ? 600 : 400,
                                  borderRadius: 4,
                                  ...cohortCellStyle(pct),
                                }}
                              >
                                {pct === null ? "—" : row.size === 0 ? "—" : `${pct}%`}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 11, color: "#A1A1AA", margin: "8px 0 0" }}>
                    % kupaca iz kohorte koji su naručili u narednim mesecima · Tamnije = viša retencija
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
