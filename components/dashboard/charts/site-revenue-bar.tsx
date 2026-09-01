"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils/currency";

interface BreakdownSegment {
  kind: "onetime" | "new" | "renewal";
  label: string;
  color: string;
  revenue: number;
  pct: number;
}

interface BreakdownItem {
  site_id: string;
  name: string;
  color: string;
  revenue: number;
  pct: number;
  segments: BreakdownSegment[];
}

interface BreakdownData {
  breakdown: BreakdownItem[];
  total: number;
  base_currency: string;
}

// Proportional revenue-by-site strip shown under the Dashboard KPIs — follows
// the same date/product filters as KPISection (kpi_preset/kpi_from/kpi_to/
// kpi_products), so it always reflects the same period as the metrics above it.
// Each site is one legend entry; its one-time / new-subscription / renewal
// split shows up as shades of the site color inside that site's bar segment.
export function SiteRevenueBar() {
  const sp = useSearchParams();
  const [data, setData] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);

  const preset        = sp.get("kpi_preset") ?? "today";
  const compare       = sp.get("kpi_compare") === "month" ? "month" : "day";
  const from          = sp.get("kpi_from");
  const to            = sp.get("kpi_to");
  const productsParam = sp.get("kpi_products");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ preset, compare });
      if (from)          params.set("from", from);
      if (to)            params.set("to", to);
      if (productsParam) params.set("products", productsParam);
      const res = await fetch(`/api/analytics/site-breakdown?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [preset, compare, from, to, productsParam]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div style={{ height: 64, background: "#F4F4F5", borderRadius: 12, animation: "pulse 2s infinite" }} />;
  }

  const breakdown = data?.breakdown ?? [];
  const total = data?.total ?? 0;
  const currency = data?.base_currency ?? "EUR";

  // Nothing to show for an empty period — don't take up space with an empty card.
  if (!breakdown.length || total <= 0) return null;

  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12,
      padding: "16px 18px",
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 12 }}>
        Prihod po sajtu
      </span>

      {/* 2px gaps separate sites; shades inside a group separate the buckets. */}
      <div style={{
        display: "flex", gap: 2, height: 10, borderRadius: 999, overflow: "hidden",
        background: "#F4F4F5", marginBottom: 12,
      }}>
        {breakdown.map((b) => (
          <div key={b.site_id} style={{ display: "flex", flex: `${b.revenue} 1 0` }}>
            {b.segments.map((s) => (
              <div
                key={s.kind}
                title={`${b.name} — ${s.label}: ${s.pct}%`}
                style={{ flex: `${s.revenue} 1 0`, background: s.color }}
              />
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
        {breakdown.map((b) => (
          <div key={b.site_id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <span style={{
                display: "flex", width: 10, height: 10, borderRadius: "50%",
                overflow: "hidden", flexShrink: 0,
              }}>
                {b.segments.map((s) => (
                  <span key={s.kind} style={{ flex: `${s.revenue} 1 0`, background: s.color }} />
                ))}
              </span>
              <span style={{ color: "#3F3F46", fontWeight: 600 }}>{b.name}</span>
              <span style={{ color: "#A1A1AA" }}>
                {b.pct}% · {formatCurrency(b.revenue, currency)}
              </span>
            </div>

            {b.segments.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", paddingLeft: 16 }}>
                {b.segments.map((s) => (
                  <span key={s.kind} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11.5, color: "#A1A1AA",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: s.color, flexShrink: 0,
                    }} />
                    {s.label} {s.pct}% · {formatCurrency(s.revenue, currency)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
