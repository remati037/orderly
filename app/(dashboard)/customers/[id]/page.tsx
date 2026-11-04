"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";
import { toBase, DEFAULT_RATES } from "@/lib/utils/fx";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  email: string;
  name: string | null;
  city: string | null;
  order_count: number;
  total_spent: number;
  first_order_at: string | null;
  last_order_at: string | null;
}

interface OrderItem {
  product_name: string;
  product_type: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  woo_order_id: string | null;
  source: string;
  status: string;
  total: number;
  net_profit: number | null;
  currency: string;
  product_type: string;
  payment_type: string;
  payment_method: string | null;
  created_at: string;
  sites: { name: string; color_hex: string; platform: string } | null;
  order_items: OrderItem[];
}

interface Stats {
  total_spent: number;
  net_spent: number;
  order_count: number;
  ltv: number;
  aov: number;
  active_subscriptions: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2)
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0][0] ?? "?").toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

function avatarColor(str: string): string {
  const colors = ["var(--tone-green)", "var(--tone-violet)", "var(--tone-pink)", "var(--tone-cyan)", "var(--tone-emerald)", "var(--tone-amber)", "var(--tone-red)"];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sr-RS", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "danas";
  if (days === 1) return "juče";
  if (days < 30) return `pre ${days} d`;
  if (days < 365) return `pre ${Math.floor(days / 30)} mes`;
  return `pre ${Math.floor(days / 365)} god`;
}

function formatAmount(total: number, currency: string): string {
  return formatRSD(toBase(total, currency, DEFAULT_RATES));
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  processing: { bg: "var(--tone-amber-1)", color: "var(--tone-amber)", label: "U obradi" },
  completed:  { bg: "var(--tone-green-1)", color: "var(--tone-green)", label: "Završeno" },
  pending:    { bg: "var(--tone-indigo-1)", color: "var(--tone-indigo)", label: "Na čekanju" },
  cancelled:  { bg: "var(--ui-subtle)", color: "var(--ui-muted)", label: "Otkazano" },
  refunded:   { bg: "var(--tone-rose-1)", color: "var(--tone-rose)", label: "Refundirano" },
  "on-hold":  { bg: "var(--tone-orange-1)", color: "var(--tone-orange-strong)", label: "Zadržano" },
};

const SEGMENT_CONFIG: Record<string, { bg: string; color: string; label: string; description: string }> = {
  VIP:     { bg: "var(--tone-orange-1)", color: "var(--tone-orange-strong)", label: "VIP",     description: "Više od €500 potrošeno" },
  Regular: { bg: "var(--tone-green-1)", color: "var(--tone-green-deep)", label: "Redovan", description: "Više od €100 potrošeno" },
  New:     { bg: "var(--tone-indigo-1)", color: "var(--tone-indigo-strong)", label: "Nov",     description: "Manje od €100 potrošeno" },
};

const PLATFORM_LABEL: Record<string, string> = {
  woocommerce: "WooCommerce",
  thinkific:   "Thinkific",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 10,
      padding: "14px 18px", flex: 1, minWidth: 0,
    }}>
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ui-muted)", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ui-text)", margin: "4px 0 0", lineHeight: 1.2 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "var(--ui-faint)", margin: "2px 0 0" }}>{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [segment, setSegment] = useState<string>("New");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setCustomer(data.customer);
      setOrders(data.orders ?? []);
      setStats(data.stats);
      setSegment(data.segment ?? "New");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: "var(--ui-faint)", fontSize: 13 }}>
        Učitavanje...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 240, gap: 12 }}>
        <p style={{ fontSize: 15, color: "var(--ui-text)", fontWeight: 600 }}>Kupac nije pronađen</p>
        <button onClick={() => router.push("/customers")} style={{ fontSize: 13, color: "var(--tone-green)", background: "none", border: "none", cursor: "pointer" }}>
          ← Nazad na listu
        </button>
      </div>
    );
  }

  const bg = avatarColor(customer.email);
  const init = initials(customer.name, customer.email);
  const seg = SEGMENT_CONFIG[segment] ?? SEGMENT_CONFIG.New;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Back */}
      <button
        onClick={() => router.push("/customers")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ui-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, alignSelf: "flex-start" }}
      >
        <ArrowLeftIcon style={{ width: 14, height: 14 }} />
        Svi kupci
      </button>

      {/* Header card */}
      <div style={{ background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "flex-start", gap: 18 }}>
        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: bg, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {init}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ui-text)", margin: 0, letterSpacing: "-0.01em" }}>
              {customer.name || customer.email}
            </h1>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: seg.bg, color: seg.color }}>
              {seg.label}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--ui-muted)", margin: "4px 0 0" }}>{customer.email}</p>
          <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
            {customer.city && (
              <span style={{ fontSize: 12, color: "var(--ui-faint)" }}>
                📍 {customer.city}
              </span>
            )}
            {customer.first_order_at && (
              <span style={{ fontSize: 12, color: "var(--ui-faint)" }}>
                Registrovan {fullDate(customer.first_order_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Ukupno potrošeno" value={formatRSD(stats.total_spent)} />
          <StatCard label="Neto zarada" value={formatRSD(stats.net_spent)} />
          <StatCard label="Porudžbine" value={String(stats.order_count)} />
          <StatCard label="LTV" value={formatRSD(stats.ltv)} sub="/mesec" />
          <StatCard label="AOV" value={formatRSD(stats.aov)} />
          {stats.active_subscriptions > 0 && (
            <StatCard label="Aktivne pretplate" value={String(stats.active_subscriptions)} />
          )}
        </div>
      )}

      {/* Order history */}
      <div style={{ background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--ui-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ui-text)" }}>Istorija porudžbina</span>
          <span style={{ fontSize: 12, color: "var(--ui-faint)" }}>{orders.length} porudžbina</span>
        </div>

        {orders.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--ui-faint)", fontSize: 13 }}>
            Nema porudžbina
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ui-subtle)" }}>
                  {["Sajt", "Platforma", "Proizvod", "Status", "Iznos", "Datum"].map((h) => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ui-faint)", textAlign: "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const s = STATUS[o.status] ?? { bg: "var(--ui-subtle)", color: "var(--ui-muted)", label: o.status };
                  const firstItem = o.order_items[0];
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--ui-subtle)" }}>
                      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: o.sites?.color_hex ?? "var(--ui-border-strong)", flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontSize: 12, color: "var(--ui-text-3)" }}>{o.sites?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                        <Badge variant="secondary" style={{ fontSize: 11 }}>
                          {PLATFORM_LABEL[o.source] ?? o.source}
                        </Badge>
                      </td>
                      <td style={{ padding: "10px 16px", verticalAlign: "middle", maxWidth: 220 }}>
                        {firstItem ? (
                          <span style={{ fontSize: 12, color: "var(--ui-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                            {firstItem.product_name}
                            {o.order_items.length > 1 && (
                              <span style={{ color: "var(--ui-faint)" }}> +{o.order_items.length - 1}</span>
                            )}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--ui-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99, background: s.bg, color: s.color }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", verticalAlign: "middle", fontWeight: 700, fontSize: 13, color: "var(--ui-text)", whiteSpace: "nowrap" }}>
                        {formatAmount(o.total, o.currency)}
                      </td>
                      <td style={{ padding: "10px 16px", verticalAlign: "middle", fontSize: 12, color: "var(--ui-faint)", whiteSpace: "nowrap" }}>
                        <span title={fullDate(o.created_at)}>{relativeTime(o.created_at)}</span>
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
