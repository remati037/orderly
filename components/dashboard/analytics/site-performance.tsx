"use client";

import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { chartColor } from "@/lib/utils/chart-color";
import { LoadError } from "@/components/dashboard/load-error";
import { ChartCard, INK, money, pct } from "./chart-kit";

interface SiteRow {
  site_id: string;
  name: string;
  color: string;
  platform: string;
  revenue: number;
  orders: number;
  aov: number;
  share: number;
  prev_revenue: number;
  trend: number | null;
}

interface BySite {
  base_currency: string;
  compare_label: string;
  total_revenue: number;
  total_orders: number;
  prev_total_revenue: number;
  sites: SiteRow[];
}

const PLATFORM: Record<string, string> = { woocommerce: "WooCommerce", thinkific: "Thinkific", stripe: "Stripe" };

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: INK.muted }}>—</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  const text = Math.abs(value) > 9.99 ? ">999%" : pct(Math.abs(value));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 600, color: up ? "#15803D" : "#B91C1C" }}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{up ? "rast" : "pad"}</span>
      {text}
    </span>
  );
}

const th: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
  color: INK.muted, textAlign: "right", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: INK.primary, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

// Revenue per site for the period chosen in the KPI filters above, with each
// site's share, orders, AOV and change vs the comparison window.
export function SitePerformance() {
  const sp = useSearchParams();
  const params = new URLSearchParams({
    preset: sp.get("kpi_preset") ?? "today",
    compare: sp.get("kpi_compare") ?? "prev",
  });
  if (sp.get("kpi_from")) params.set("from", sp.get("kpi_from")!);
  if (sp.get("kpi_to")) params.set("to", sp.get("kpi_to")!);

  const { data, error, isLoading, mutate } = useSWR<BySite>(`/api/analytics/by-site?${params}`, jsonFetcher, { keepPreviousData: true });
  const cur = data?.base_currency ?? "EUR";
  const totalTrend = data && data.prev_total_revenue ? (data.total_revenue - data.prev_total_revenue) / data.prev_total_revenue : null;

  return (
    <ChartCard title="Promet po sajtovima" subtitle="Izabrani period iz filtera iznad · udeo u ukupnom prometu">
      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <div style={{ height: 180, background: INK.grid, borderRadius: 8 }} className="animate-pulse" />
      ) : !data?.sites.length ? (
        <p style={{ fontSize: 13, color: INK.muted, padding: "24px 0", textAlign: "center" }}>Nema prometa u izabranom periodu.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
                <th style={{ ...th, textAlign: "left" }}>Sajt</th>
                <th style={th}>Prihod</th>
                <th style={{ ...th, textAlign: "left", width: "28%" }}>Udeo</th>
                <th style={th}>Porudžbine</th>
                <th style={th}>Prosečna porudžbina</th>
                <th style={th}>vs {data.compare_label}</th>
              </tr>
            </thead>
            <tbody>
              {data.sites.map((s) => {
                const color = chartColor(s.color);
                return (
                  <tr key={s.site_id} style={{ borderBottom: `1px solid ${INK.grid}` }}>
                    <td style={{ ...td, textAlign: "left" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                        <span>
                          <span style={{ fontWeight: 500 }}>{s.name}</span>
                          <span style={{ display: "block", fontSize: 11, color: INK.muted }}>{PLATFORM[s.platform] ?? s.platform}</span>
                        </span>
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{money(s.revenue, cur)}</td>
                    <td style={{ ...td, textAlign: "left" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ flex: 1, height: 8, background: INK.grid, borderRadius: 4, overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${Math.max(s.share * 100, s.revenue > 0 ? 1 : 0)}%`, background: color, borderRadius: 4 }} />
                        </span>
                        <span style={{ width: 48, textAlign: "right", color: INK.secondary, fontSize: 12 }}>{pct(s.share)}</span>
                      </span>
                    </td>
                    <td style={td}>{s.orders.toLocaleString("sr-RS")}</td>
                    <td style={td}>{money(s.aov, cur)}</td>
                    <td style={td}>
                      <span title={`${data.compare_label}: ${money(s.prev_revenue, cur)}`}><Trend value={s.trend} /></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>Ukupno</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(data.total_revenue, cur)}</td>
                <td style={td} />
                <td style={{ ...td, fontWeight: 600 }}>{data.total_orders.toLocaleString("sr-RS")}</td>
                <td style={td}>{money(data.total_orders ? data.total_revenue / data.total_orders : 0, cur)}</td>
                <td style={td}><Trend value={totalTrend} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
