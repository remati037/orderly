"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils/currency";

interface BreakdownItem {
  site_id: string;
  name: string;
  color: string;
  revenue: number;
  pct: number;
}

interface BreakdownData {
  breakdown: BreakdownItem[];
  total: number;
  base_currency: string;
}

// Proportional revenue-by-site strip shown under the Dashboard KPIs — follows
// the same date/product filters as KPISection (kpi_preset/kpi_from/kpi_to/
// kpi_products), so it always reflects the same period as the metrics above it.
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

      <div style={{
        display: "flex", height: 10, borderRadius: 999, overflow: "hidden",
        background: "#F4F4F5", marginBottom: 12,
      }}>
        {breakdown.map((b) => (
          <div
            key={b.site_id}
            title={`${b.name} — ${b.pct}%`}
            style={{ width: `${(b.revenue / total) * 100}%`, background: b.color }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
        {breakdown.map((b) => (
          <div key={b.site_id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
            <span style={{ color: "#3F3F46", fontWeight: 600 }}>{b.name}</span>
            <span style={{ color: "#A1A1AA" }}>
              {b.pct}% · {formatCurrency(b.revenue, data?.base_currency ?? "EUR")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
