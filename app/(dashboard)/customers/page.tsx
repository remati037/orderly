"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UsersIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  email: string | null;
  name: string | null;
  city: string | null;
  order_count: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
  ltv_score: number;
  segment: "VIP" | "Regular" | "New";
  primary_site: {
    name: string;
    color: string;
    platform: string;
  } | null;
}

type SortKey = keyof Pick<Customer, "total_spent" | "order_count" | "last_order_at" | "ltv_score" | "name">;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0][0] ?? "?").toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

function avatarColor(str: string): string {
  const colors = ["#16A34A", "#7C3AED", "#DB2777", "#0891B2", "#059669", "#D97706", "#DC2626"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "danas";
  if (days === 1) return "juče";
  if (days < 30) return `pre ${days} d`;
  if (days < 365) return `pre ${Math.floor(days / 30)} mes`;
  return `pre ${Math.floor(days / 365)} god`;
}

const SEGMENT_STYLE: Record<string, { bg: string; color: string }> = {
  VIP:     { bg: "#FFF7ED", color: "#C2410C" },
  Regular: { bg: "#F0FDF4", color: "#166534" },
  New:     { bg: "#EEF2FF", color: "#4338CA" },
};

// ── Sort helpers ──────────────────────────────────────────────────────────────

function sortCustomers(customers: Customer[], key: SortKey, asc: boolean): Customer[] {
  return [...customers].sort((a, b) => {
    let va: string | number = a[key] ?? 0;
    let vb: string | number = b[key] ?? 0;
    if (typeof va === "string" && typeof vb === "string") {
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
}

// ── Header cell ───────────────────────────────────────────────────────────────

function SortHeader({
  label, sortKey, currentSort, currentAsc, onSort,
}: {
  label: string; sortKey: SortKey; currentSort: SortKey; currentAsc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: "10px 16px",
        fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
        color: active ? "#18181B" : "#A1A1AA",
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        textAlign: "left",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3 }}>
          {active && !currentAsc ? (
            <ChevronUpIcon style={{ width: 13, height: 13 }} />
          ) : (
            <ChevronDownIcon style={{ width: 13, height: 13 }} />
          )}
        </span>
      </span>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("total_spent");
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?sort=${sortKey}&order=${sortAsc ? "asc" : "desc"}`);
      if (res.ok) setCustomers(await res.json().then((d) => d.customers ?? []));
    } finally {
      setLoading(false);
    }
  }, [sortKey, sortAsc]);

  useEffect(() => { load(); }, [load]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = sortCustomers(customers, sortKey, sortAsc);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0 }}>
            Kupci
          </h1>
          <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
            {loading ? "Učitavanje..." : `${customers.length.toLocaleString("sr-RS")} kupaca`}
          </p>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "64px 20px", textAlign: "center", color: "#A1A1AA", fontSize: 13 }}>
            Učitavanje...
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "64px 20px", textAlign: "center", color: "#A1A1AA", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <UsersIcon style={{ width: 36, height: 36, opacity: 0.3 }} />
            Nema kupaca — porudžbine će se pojaviti ovde nakon sinhronizacije
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F4F4F5" }}>
                  <th style={{ padding: "10px 20px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#A1A1AA", textAlign: "left" }}>
                    Kupac
                  </th>
                  <SortHeader label="Potrošeno" sortKey="total_spent" currentSort={sortKey} currentAsc={sortAsc} onSort={handleSort} />
                  <SortHeader label="Porudžbine" sortKey="order_count" currentSort={sortKey} currentAsc={sortAsc} onSort={handleSort} />
                  <SortHeader label="LTV/mes" sortKey="ltv_score" currentSort={sortKey} currentAsc={sortAsc} onSort={handleSort} />
                  <th style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#A1A1AA", textAlign: "left" }}>
                    Sajt
                  </th>
                  <SortHeader label="Poslednja" sortKey="last_order_at" currentSort={sortKey} currentAsc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const key = c.email ?? c.id;
                  const bg = avatarColor(key);
                  const init = initials(c.name, c.email);
                  const seg = SEGMENT_STYLE[c.segment];

                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/customers/${c.id}`)}
                      style={{ cursor: "pointer", borderBottom: "1px solid #F4F4F5", transition: "background 80ms" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Avatar + name + email */}
                      <td style={{ padding: "10px 20px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: bg, color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                          }}>
                            {init}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#18181B", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.name || "—"}
                            </p>
                            <p style={{ fontSize: 11, color: "#A1A1AA", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.email}
                            </p>
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                            background: seg.bg, color: seg.color, flexShrink: 0,
                          }}>
                            {c.segment}
                          </span>
                        </div>
                      </td>

                      {/* Total spent */}
                      <td style={{ padding: "10px 16px", verticalAlign: "middle", fontWeight: 700, fontSize: 13, color: "#18181B", whiteSpace: "nowrap" }}>
                        {formatRSD(c.total_spent ?? 0)}
                      </td>

                      {/* Order count */}
                      <td style={{ padding: "10px 16px", verticalAlign: "middle", fontSize: 13, color: "#52525B" }}>
                        {c.order_count ?? 0}
                      </td>

                      {/* LTV score */}
                      <td style={{ padding: "10px 16px", verticalAlign: "middle", fontSize: 13, color: "#52525B", whiteSpace: "nowrap" }}>
                        {formatRSD(c.ltv_score)}<span style={{ fontSize: 11, color: "#A1A1AA" }}>/mes</span>
                      </td>

                      {/* Primary site */}
                      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                        {c.primary_site ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.primary_site.color, flexShrink: 0, display: "inline-block" }} />
                            <span style={{ fontSize: 12, color: "#52525B" }}>{c.primary_site.name}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#A1A1AA" }}>—</span>
                        )}
                      </td>

                      {/* Last order */}
                      <td style={{ padding: "10px 20px 10px 16px", verticalAlign: "middle", fontSize: 12, color: "#A1A1AA", whiteSpace: "nowrap" }}>
                        {relativeTime(c.last_order_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
