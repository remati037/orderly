"use client";

import useSWR from "swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { chartColor } from "@/lib/utils/chart-color";
import { formatCurrency } from "@/lib/utils/currency";
import { LoadError } from "./load-error";

interface SiteRow {
  site_id: string;
  name: string;
  color: string;
  revenue: number;
  trend: number | null;
  orders: number;
  orders_trend: number | null;
  aov: number;
  aov_trend: number | null;
  net_profit: number;
  ad_spend: number | null;
}

interface BySite {
  base_currency: string;
  compare_label: string;
  total_revenue: number;
  total_revenue_trend: number | null;
  total_orders: number;
  total_orders_trend: number | null;
  total_aov: number;
  total_aov_trend: number | null;
  total_net_profit: number;
  total_ad_spend: number | null;
  sites: SiteRow[];
}

const th: React.CSSProperties = {
  padding: "0 10px 6px", fontSize: 11, fontWeight: 500, color: "var(--ui-faint)",
  textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid var(--ui-subtle)",
};
// Headers of columns with a change box sit over the figure, not over the box.
const thWithChange: React.CSSProperties = { ...th, paddingRight: 54 };
const td: React.CSSProperties = {
  padding: "6px 10px", fontSize: 12.5, color: "var(--ui-text)", textAlign: "right",
  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
};

// Fixed width, even when empty, so the figures line up down each column.
const changeBox: React.CSSProperties = { display: "inline-block", width: 44, textAlign: "right", fontSize: 11, fontWeight: 500 };

function Change({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span aria-hidden style={changeBox} />;
  const rounded = Math.round(Math.abs(value) * 100);
  const sign = rounded === 0 ? "" : value > 0 ? "+" : "−";
  const color = rounded === 0 ? "var(--ui-faint)" : value > 0 ? "var(--tone-green-strong)" : "var(--tone-red-strong)";
  return (
    <span title={`u odnosu na ${label}`} style={{ ...changeBox, color }}>
      {rounded > 999 ? `${sign}>999%` : `${sign}${rounded}%`}
    </span>
  );
}

// One compact row per site under the Dashboard KPIs, largest revenue first —
// same figures and same period/compare/product filters as the KPI cards, so the
// "Ukupno" row matches them. A single-site filter already turns the cards into
// that site's numbers, so the list steps aside then.
export function SiteSummaryTable() {
  const sp = useSearchParams();
  const router = useRouter();

  const params = new URLSearchParams({
    preset: sp.get("kpi_preset") ?? "today",
    compare: sp.get("kpi_compare") ?? "prev",
  });
  if (sp.get("kpi_from")) params.set("from", sp.get("kpi_from")!);
  if (sp.get("kpi_to")) params.set("to", sp.get("kpi_to")!);
  if (sp.get("kpi_products")) params.set("products", sp.get("kpi_products")!);

  const { data, error, isLoading, mutate } = useSWR<BySite>(
    `/api/analytics/by-site?${params}`,
    jsonFetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, keepPreviousData: true }
  );

  if (sp.get("kpi_site")) return null;
  if (error && !data) return <LoadError onRetry={() => mutate()} compact />;
  if (isLoading && !data) {
    return <div style={{ height: 120, background: "var(--ui-subtle)", borderRadius: 12, animation: "pulse 2s infinite" }} />;
  }
  if (!data?.sites.length) return null;

  const cur = data.base_currency;
  const label = data.compare_label;

  return (
    <div style={{ background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 12, padding: "14px 8px 8px" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Sajt</th>
              <th style={thWithChange}>Prihod</th>
              <th style={thWithChange}>Porudžbine</th>
              <th style={thWithChange}>AOV</th>
              <th style={th} title="Potrošnja kampanja povezanih sa ovim sajtom. Nije oduzeta od neto zarade.">Facebook reklame</th>
              <th style={th}>Neto zarada</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((s) => {
              const idle = s.orders === 0 && s.revenue === 0;
              const cell = idle ? { ...td, color: "var(--ui-faint)" } : td;
              const href = `/dashboard/${s.site_id}`;
              return (
                <tr
                  key={s.site_id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-[var(--ui-subtle)]"
                  style={{ borderBottom: "1px solid var(--ui-subtle)" }}
                >
                  <td style={{ ...cell, textAlign: "left" }}>
                    <span aria-hidden style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: 2,
                      background: chartColor(s.color), marginRight: 8,
                    }} />
                    <Link href={href} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 500 }}>
                      {s.name}
                    </Link>
                  </td>
                  <td style={{ ...cell, fontWeight: 600, color: s.revenue < 0 ? "var(--tone-red-strong)" : cell.color }}>
                    {formatCurrency(s.revenue, cur)}
                    <Change value={s.trend} label={label} />
                  </td>
                  <td style={cell}>
                    {s.orders.toLocaleString("sr-RS")}
                    <Change value={s.orders_trend} label={label} />
                  </td>
                  <td style={cell}>
                    {s.orders ? formatCurrency(s.aov, cur) : "—"}
                    <Change value={s.aov_trend} label={label} />
                  </td>
                  <td style={cell}>{s.ad_spend === null ? "—" : formatCurrency(s.ad_spend, cur)}</td>
                  <td style={cell}>{formatCurrency(s.net_profit, cur)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>Ukupno</td>
              <td style={{ ...td, fontWeight: 600 }}>
                {formatCurrency(data.total_revenue, cur)}
                <Change value={data.total_revenue_trend} label={label} />
              </td>
              <td style={{ ...td, fontWeight: 600 }}>
                {data.total_orders.toLocaleString("sr-RS")}
                <Change value={data.total_orders_trend} label={label} />
              </td>
              <td style={{ ...td, fontWeight: 600 }}>
                {data.total_orders ? formatCurrency(data.total_aov, cur) : "—"}
                <Change value={data.total_aov_trend} label={label} />
              </td>
              <td style={{ ...td, fontWeight: 600 }}>{data.total_ad_spend === null ? "—" : formatCurrency(data.total_ad_spend, cur)}</td>
              <td style={{ ...td, fontWeight: 600 }}>{formatCurrency(data.total_net_profit, cur)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
