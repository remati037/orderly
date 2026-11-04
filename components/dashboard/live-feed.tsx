"use client";

import { useRealtimeOrdersContext } from "@/lib/contexts/realtime-orders-context";
import type { RealtimeOrder } from "@/lib/hooks/use-realtime-orders";
import { toBase, DEFAULT_RATES } from "@/lib/utils/fx";
import { SubscriptionDots } from "@/components/dashboard/subscription-dots";
import { RadioIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  from { background-color: var(--tone-green-2); opacity: 0; }
  to   { background-color: transparent; opacity: 1; }
}
@keyframes lf-dot-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
`;

// ── lookups ────────────────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  processing: { bg: "var(--tone-amber-1)", color: "var(--tone-amber)", label: "Processing" },
  completed:  { bg: "var(--tone-green-1)", color: "var(--tone-green)", label: "Completed" },
  pending:    { bg: "var(--tone-indigo-1)", color: "var(--tone-indigo)", label: "Pending" },
  cancelled:  { bg: "var(--ui-subtle)", color: "var(--ui-muted)", label: "Cancelled" },
  refunded:   { bg: "var(--tone-rose-1)", color: "var(--tone-rose)", label: "Refunded" },
  "on-hold":  { bg: "var(--tone-orange-1)", color: "var(--tone-orange-strong)", label: "On hold" },
  failed:     { bg: "var(--tone-red-1)", color: "var(--tone-red)", label: "Failed" },
};

const PRODUCT_TYPE: Record<string, { bg: string; color: string }> = {
  digital:      { bg: "var(--tone-indigo-1)", color: "var(--tone-indigo-strong)" },
  physical:     { bg: "var(--ui-subtle)", color: "var(--ui-text-3)" },
  subscription: { bg: "var(--tone-green-1)", color: "var(--tone-green-deep)" },
};

// ── sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: "var(--ui-subtle)", color: "var(--ui-muted)", label: status };
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
  const t = PRODUCT_TYPE[type] ?? { bg: "var(--ui-subtle)", color: "var(--ui-text-3)" };
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
  seq,
}: {
  order: RealtimeOrder;
  isFresh: boolean;
  seq?: number | null;
}) {

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderBottom: "1px solid var(--ui-subtle)",
        animation: isFresh
          ? "lf-row-enter 600ms cubic-bezier(0.4,0,0.2,1) forwards"
          : undefined,
        transition: "background-color 120ms",
      }}
      onMouseEnter={(e) =>
        !isFresh && (e.currentTarget.style.backgroundColor = "var(--ui-sidebar)")
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
          color: "var(--ui-text)",
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
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            minWidth: 0,
            fontSize: 12,
            color: "var(--ui-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {order.product_name ?? order.site_name}
        </span>
        {!!seq && <SubscriptionDots seq={seq} />}
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
          background: "var(--tone-orange-1)",
          color: "var(--tone-orange-strong)",
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
          color: "var(--ui-text)",
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

  // The realtime path never fills in subscription_seq (see the type comment) —
  // fetch it per order client-side. requestedRef dedupes so a null result
  // (not a subscription product, or the customer's first payment) isn't
  // re-fetched forever just because it never earns an entry in seqMap.
  const [seqMap, setSeqMap] = useState<Record<string, number>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const toFetch = visible.filter(
      (o) => o.subscription_seq == null && !requestedRef.current.has(o.id)
    );
    if (!toFetch.length) return;
    toFetch.forEach((o) => requestedRef.current.add(o.id));

    (async () => {
      const entries = await Promise.all(
        toFetch.map(async (o) => {
          try {
            const res = await fetch(`/api/orders/${o.id}/subscription-seq`);
            if (!res.ok) return null;
            const json = await res.json();
            return json.seq ? ([o.id, json.seq as number] as const) : null;
          } catch {
            return null;
          }
        })
      );
      setSeqMap((prev) => {
        const next = { ...prev };
        for (const e of entries) if (e) next[e[0]] = e[1];
        return next;
      });
    })();
  }, [visible]);

  return (
    <>
      <style>{STYLES}</style>

      <div
        style={{
          background: "var(--ui-surface)",
          border: "1px solid var(--ui-border)",
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
            borderBottom: "1px solid var(--ui-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ui-text)",
              }}
            >
              {isLive ? "Uživo" : `Porudžbine — ${PRESET_LABELS[preset] ?? ""}`}
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
              {newOrderCount} novih
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
              color: "var(--ui-faint)",
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
                seq={order.subscription_seq ?? seqMap[order.id]}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
