"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUpIcon, UsersIcon, UserMinusIcon, UserPlusIcon, PercentIcon,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";
import { toBase, DEFAULT_RATES } from "@/lib/utils/fx";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  color_hex: string;
  project_type: string;
}

interface Subscription {
  id: string;
  site_id: string;
  product_name: string;
  mrr: number;
  status: string;
  started_at: string;
  customers: { id: string; name: string; email: string } | null;
  sites: { id: string; name: string; color_hex: string; platform: string } | null;
}

interface KPI {
  total_mrr: number;
  active_subscribers: number;
  new_this_month: number;
  churned_this_month: number;
  churn_rate: number;
}

interface MrrPoint {
  month: string;
  mrr: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "danas";
  if (days === 1) return "juče";
  if (days < 30) return `pre ${days} d`;
  if (days < 365) return `pre ${Math.floor(days / 30)} mes`;
  return `pre ${Math.floor(days / 365)} god`;
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sr-RS", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: "#F0FDF4", color: "#16A34A", label: "Aktivan" },
  cancelled: { bg: "#F4F4F5", color: "#71717A", label: "Otkazan" },
  paused:    { bg: "#FFFBEB", color: "#D97706", label: "Pauziran" },
  churned:   { bg: "#FFF1F2", color: "#E11D48", label: "Churned" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, positive,
}: {
  label: string; value: string; icon: typeof TrendingUpIcon; positive?: boolean;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12,
      padding: "18px 20px", flex: 1, minWidth: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "#71717A" }}>
          {label}
        </span>
        <Icon style={{ width: 15, height: 15, color: "#A1A1AA", flexShrink: 0 }} />
      </div>
      <span style={{
        display: "block", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em",
        color: positive === false ? "#DC2626" : "#18181B",
        marginTop: 6, lineHeight: 1.2,
      }}>
        {value}
      </span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#18181B" }}>{label}</p>
      <p style={{ margin: 0, color: "#16A34A" }}>
        <span style={{ fontWeight: 600 }}>MRR: </span>{formatRSD(payload[0].value)}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionSites, setSubscriptionSites] = useState<Site[]>([]);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [mrrChart, setMrrChart] = useState<MrrPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSite, setFilterSite] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions");
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions ?? []);
        setSubscriptionSites(data.subscriptionSites ?? []);
        setKpi(data.kpi ?? null);
        setMrrChart(data.mrr_chart ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredSubs = filterSite === "all"
    ? subscriptions
    : subscriptions.filter((s) => s.site_id === filterSite);

  const noSubscriptionSites = !loading && subscriptionSites.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0 }}>
          Pretplate
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
          MRR, pretplatnici i churn — sajtovi tipa Subscription
        </p>
      </div>

      {noSubscriptionSites ? (
        <div style={{
          background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12,
          padding: "64px 20px", textAlign: "center",
        }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#18181B", margin: 0 }}>
            Nema sajtova sa pretplatama
          </p>
          <p style={{ fontSize: 13, color: "#A1A1AA", margin: "8px 0 0" }}>
            Podesi tip projekta na "Subscription" u podešavanjima sajta da bi video statistike ovde
          </p>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <KpiCard
              label="Ukupni MRR"
              value={kpi ? formatRSD(kpi.total_mrr) : "—"}
              icon={TrendingUpIcon}
            />
            <KpiCard
              label="Aktivni pretplatnici"
              value={kpi ? String(kpi.active_subscribers) : "—"}
              icon={UsersIcon}
            />
            <KpiCard
              label="Novi ovog meseca"
              value={kpi ? String(kpi.new_this_month) : "—"}
              icon={UserPlusIcon}
            />
            <KpiCard
              label="Churned ovog meseca"
              value={kpi ? String(kpi.churned_this_month) : "—"}
              icon={UserMinusIcon}
              positive={false}
            />
            <KpiCard
              label="Churn rate"
              value={kpi ? `${kpi.churn_rate}%` : "—"}
              icon={PercentIcon}
              positive={false}
            />
          </div>

          {/* MRR chart */}
          <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, padding: "18px 20px" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#18181B", margin: "0 0 16px" }}>
              MRR trend — poslednjih 6 meseci
            </p>
            {loading ? (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", fontSize: 13 }}>
                Učitavanje…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={mrrChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16A34A" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#F4F4F5" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    stroke="#16A34A"
                    strokeWidth={2}
                    fill="url(#mrrGrad)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Subscribers table */}
          <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F4F4F5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#18181B" }}>
                Pretplatnici
              </span>

              {/* Site filter */}
              {subscriptionSites.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setFilterSite("all")}
                    style={{
                      fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 99,
                      border: "1px solid", cursor: "pointer",
                      background: filterSite === "all" ? "#16A34A" : "transparent",
                      borderColor: filterSite === "all" ? "#16A34A" : "#E4E4E7",
                      color: filterSite === "all" ? "#fff" : "#71717A",
                    }}
                  >
                    Svi
                  </button>
                  {subscriptionSites.map((site) => (
                    <button
                      key={site.id}
                      onClick={() => setFilterSite(site.id)}
                      style={{
                        fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 99,
                        border: "1px solid", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                        background: filterSite === site.id ? "#16A34A" : "transparent",
                        borderColor: filterSite === site.id ? "#16A34A" : "#E4E4E7",
                        color: filterSite === site.id ? "#fff" : "#71717A",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: filterSite === site.id ? "#fff" : site.color_hex }} />
                      {site.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#A1A1AA", fontSize: 13 }}>
                Učitavanje...
              </div>
            ) : filteredSubs.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#A1A1AA", fontSize: 13 }}>
                Nema pretplatnika
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F4F4F5" }}>
                      {["Kupac", "Proizvod", "Sajt", "MRR", "Status", "Počeo", "Naredna naplata"].map((h) => (
                        <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#A1A1AA", textAlign: "left" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubs.map((sub) => {
                      const st = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active;
                      return (
                        <tr key={sub.id} style={{ borderBottom: "1px solid #F4F4F5" }}>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#18181B", margin: 0 }}>
                              {sub.customers?.name || "—"}
                            </p>
                            <p style={{ fontSize: 11, color: "#A1A1AA", margin: 0 }}>
                              {sub.customers?.email}
                            </p>
                          </td>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle", fontSize: 12, color: "#52525B", maxWidth: 200 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                              {sub.product_name || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: sub.sites?.color_hex ?? "#D4D4D8", flexShrink: 0, display: "inline-block" }} />
                              <span style={{ fontSize: 12, color: "#52525B" }}>{sub.sites?.name ?? "—"}</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle", fontWeight: 700, fontSize: 13, color: "#18181B", whiteSpace: "nowrap" }}>
                            {formatRSD(toBase(sub.mrr ?? 0, "RSD", DEFAULT_RATES))}
                          </td>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99, background: st.bg, color: st.color }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color }} />
                              {st.label}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle", fontSize: 12, color: "#A1A1AA", whiteSpace: "nowrap" }}>
                            <span title={sub.started_at ? fullDate(sub.started_at) : ""}>
                              {relativeTime(sub.started_at)}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", verticalAlign: "middle", fontSize: 12, color: "#A1A1AA" }}>
                            —
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
