"use client";

import { useRealtimeOrdersContext } from "@/lib/contexts/realtime-orders-context";
import type { RealtimeOrder } from "@/lib/hooks/use-realtime-orders";
import { toBase, DEFAULT_RATES } from "@/lib/utils/fx";
import { RadioIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

const PRESET_LABELS: Record<string, string> = {
  yesterday:  "juče",
  this_week:  "ove nedelje",
  this_month: "ovog meseca",
  this_year:  "ove godine",
  custom:     "za izabrani period",
};

async function feedFetcher(url: string): Promise<{ orders: RealtimeOrder[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("feed fetch failed");
  return res.json();
}

// ── animation keyframes injected once ─────────────────────────────────────────

const STYLES = `
@keyframes lf-row-enter {
  from { background-color: #DCFCE7; opacity: 0; }
  to   { background-color: transparent; opacity: 1; }
}
@keyframes lf-dot-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
`;

// ── lookups ────────────────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  processing: { bg: "#FFFBEB", color: "#D97706", label: "Processing" },
  completed:  { bg: "#F0FDF4", color: "#16A34A", label: "Completed" },
  pending:    { bg: "#EEF2FF", color: "#6366F1", label: "Pending" },
  cancelled:  { bg: "#F4F4F5", color: "#71717A", label: "Cancelled" },
  refunded:   { bg: "#FFF1F2", color: "#E11D48", label: "Refunded" },
  "on-hold":  { bg: "#FFF7ED", color: "#C2410C", label: "On hold" },
  failed:     { bg: "#FEF2F2", color: "#DC2626", label: "Failed" },
};

const PRODUCT_TYPE: Record<string, { bg: string; color: string }> = {
  digital:      { bg: "#EEF2FF", color: "#4338CA" },
  physical:     { bg: "#F4F4F5", color: "#52525B" },
  subscription: { bg: "#F0FDF4", color: "#166534" },
};

// ── sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: "#F4F4F5", color: "#71717A", label: status };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 99,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: s.color,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}

function ProductTypeTag({ type }: { type: string }) {
  const t = PRODUCT_TYPE[type] ?? { bg: "#F4F4F5", color: "#52525B" };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 6px",
        borderRadius: 6,
        background: t.bg,
        color: t.color,
        whiteSpace: "nowrap",
        flexShrink: 0,
        textTransform: "capitalize",
      }}
    >
      {type}
    </span>
  );
}

function formatAmount(total: number, currency: string): string {
  const eur = toBase(total, currency, DEFAULT_RATES);
  return `€${eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── order row ──────────────────────────────────────────────────────────────────

function OrderRow({
  order,
  isFresh,
}: {
  order: RealtimeOrder;
  isFresh: boolean;
}) {

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid #F4F4F5",
        animation: isFresh
          ? "lf-row-enter 600ms cubic-bezier(0.4,0,0.2,1) forwards"
          : undefined,
        transition: "background-color 120ms",
      }}
      onMouseEnter={(e) =>
        !isFresh && (e.currentTarget.style.backgroundColor = "#FAFAFA")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      {/* site color dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: order.site_color,
          flexShrink: 0,
        }}
      />

      {/* customer name */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "#18181B",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {order.customer_name || "—"}
      </span>

      {/* product name */}
      <span
        style={{
          flex: 2,
          minWidth: 0,
          fontSize: 12,
          color: "#71717A",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {order.product_name ?? order.site_name}
      </span>

      {/* product type tag */}
      <ProductTypeTag type={order.product_type} />

      {/* late badge */}
      {order.is_late && (
        <span style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 600,
          padding: "1px 6px",
          borderRadius: 6,
          background: "#FFF7ED",
          color: "#C2410C",
          whiteSpace: "nowrap",
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}>
          zakasnelo
        </span>
      )}

      {/* status badge */}
      <StatusBadge status={order.status} />

      {/* amount */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#18181B",
          textAlign: "right",
          minWidth: 90,
          flexShrink: 0,
        }}
      >
        {formatAmount(order.total, order.currency)}
      </span>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

const MAX_VISIBLE = 15;

export function LiveFeed() {
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const { recentOrders, newOrderCount, clearNewCount, subscribeToNewOrders } =
    useRealtimeOrdersContext();

  const sp = useSearchParams();
  const preset = sp.get("kpi_preset") ?? "today";
  const from = sp.get("kpi_from");
  const to = sp.get("kpi_to");
  const siteId = sp.get("kpi_site");
  const products = (sp.get("kpi_products") ?? "").split(",").filter(Boolean);

  // "today" (no explicit range) is live via the realtime channel; any other
  // period is a static fetch — the channel only ever holds today's orders.
  const isLive = preset === "today" && !from && !to;

  const feedParams = new URLSearchParams({ preset });
  if (from) feedParams.set("from", from);
  if (to) feedParams.set("to", to);
  if (siteId) feedParams.set("siteId", siteId);
  if (products.length) feedParams.set("products", products.join(","));

  const { data: fetched } = useSWR(
    isLive ? null : `/api/orders/feed?${feedParams.toString()}`,
    feedFetcher,
    { refreshInterval: 30_000 }
  );

  // Register animation callback with the layout-level channel — no subscription of our own
  useEffect(() => {
    return subscribeToNewOrders((order: RealtimeOrder) => {
      setFreshIds((s) => new Set([...s, order.id]));
      setTimeout(() => {
        setFreshIds((s) => {
          const next = new Set(s);
          next.delete(order.id);
          return next;
        });
      }, 700);
    });
  }, [subscribeToNewOrders]);

  // Live view filters the realtime set by site/product client-side; other
  // periods come pre-filtered from the endpoint.
  const source = isLive
    ? recentOrders.filter((o) => {
        if (siteId && o.site_id !== siteId) return false;
        if (products.length && !products.includes(o.product_name ?? "")) return false;
        return true;
      })
    : fetched?.orders ?? [];

  const visible = source.slice(0, MAX_VISIBLE);

  return (
    <>
      <style>{STYLES}</style>

      <div
        style={{
          background: "#fff",
          border: "1px solid #E4E4E7",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {/* ── header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid #F4F4F5",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#18181B",
              }}
            >
              {isLive ? "Live feed" : `Porudžbine — ${PRESET_LABELS[preset] ?? ""}`}
            </span>
            {/* pulsing green dot — only in live mode */}
            {isLive && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  backgroundColor: "#22C55E",
                  animation: "lf-dot-pulse 2s ease-in-out infinite",
                  display: "inline-block",
                }}
              />
            )}
          </div>

          {isLive && newOrderCount > 0 && (
            <button
              onClick={clearNewCount}
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 9px",
                borderRadius: 99,
                background: "#3B82F6",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              {newOrderCount} new
            </button>
          )}
        </div>

        {/* ── rows ── */}
        {visible.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 16px",
              color: "#A1A1AA",
              gap: 10,
            }}
          >
            <RadioIcon style={{ width: 28, height: 28 }} />
            <p style={{ fontSize: 13, margin: 0 }}>
              {isLive ? "Čeka se prva porudžbina..." : "Nema porudžbina za izabrani period."}
            </p>
          </div>
        ) : (
          <div>
            {visible.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                isFresh={freshIds.has(order.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
