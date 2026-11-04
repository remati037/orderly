"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils/currency";
import { toBase } from "@/lib/utils/fx";
import { SubscriptionDots } from "@/components/dashboard/subscription-dots";

// ── types ──────────────────────────────────────────────────────────────────────

export interface OrderItem {
  product_name: string;
  product_type: string;
  quantity: number;
  price: number;
}

export interface OrderRow {
  id: string;
  woo_order_id: string | null;
  source: string;
  status: string;
  total: number;
  net_profit: number | null;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  product_type: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  sites: { name: string; color_hex: string } | null;
  order_items: OrderItem[];
}

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

const PLATFORM_LABEL: Record<string, string> = {
  woocommerce: "WooCommerce",
  thinkific:   "Thinkific",
};

// ── helpers ────────────────────────────────────────────────────────────────────

function formatAmount(total: number, currency: string): string {
  return formatCurrency(total, currency);
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)   return "upravo sada";
  if (hours < 1)  return `pre ${mins} min`;
  if (hours < 24) {
    if (hours === 1)           return "pre 1 sat";
    if (hours <= 4)            return `pre ${hours} sata`;
    return `pre ${hours} sati`;
  }
  if (days === 1)              return "pre 1 dan";
  if (days <= 4)               return `pre ${days} dana`;
  if (days < 30)               return `pre ${days} dana`;
  return new Date(dateStr).toLocaleDateString("sr-RS");
}

function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("sr-RS", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── badges (shared with live-feed style) ──────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { bg: "var(--ui-subtle)", color: "var(--ui-muted)", label: status };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99,
      background: s.bg, color: s.color, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function ProductTypeTag({ type }: { type: string }) {
  const t = PRODUCT_TYPE[type] ?? { bg: "var(--ui-subtle)", color: "var(--ui-text-3)" };
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 500,
      padding: "2px 6px", borderRadius: 6, background: t.bg, color: t.color,
      whiteSpace: "nowrap", flexShrink: 0, textTransform: "capitalize",
    }}>
      {type}
    </span>
  );
}

// ── order detail sheet ─────────────────────────────────────────────────────────

function OrderDetail({
  order,
  baseCurrency,
  exchangeRates,
  subscriptionSeq,
}: {
  order: OrderRow;
  baseCurrency: string;
  exchangeRates: Record<string, number>;
  subscriptionSeq?: number | null;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* Customer */}
      <section style={{ padding: "20px 20px 0" }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ui-faint)", marginBottom: 10 }}>
          Kupac
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ui-text)", marginBottom: 2 }}>
          {order.customer_name || "—"}
        </p>
        {order.customer_email && (
          <p style={{ fontSize: 12, color: "var(--ui-muted)", marginBottom: 2 }}>{order.customer_email}</p>
        )}
        {order.customer_city && (
          <p style={{ fontSize: 12, color: "var(--ui-faint)" }}>{order.customer_city}</p>
        )}
      </section>

      <Separator style={{ margin: "16px 0" }} />

      {/* Site + platform */}
      <section style={{ padding: "0 20px" }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ui-faint)", marginBottom: 10 }}>
          Sajt
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {order.sites && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--ui-text)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: order.sites.color_hex, flexShrink: 0 }} />
              {order.sites.name}
            </span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 6,
            background: "var(--ui-subtle)", color: "var(--ui-text-3)",
          }}>
            {PLATFORM_LABEL[order.source] ?? order.source}
          </span>
          <ProductTypeTag type={order.product_type} />
        </div>
      </section>

      <Separator style={{ margin: "16px 0" }} />

      {/* Items */}
      <section style={{ padding: "0 20px" }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ui-faint)", marginBottom: 10 }}>
          Stavke
        </p>
        {order.order_items.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ui-faint)" }}>Nema stavki</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {order.order_items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, color: "var(--ui-text)", overflow: "hidden" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product_name}</span>
                    {i === 0 && subscriptionSeq && <SubscriptionDots seq={subscriptionSeq} />}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>{item.quantity}× po {formatAmount(item.price / item.quantity, order.currency)}</span>
                </div>
                <span style={{ fontWeight: 600, color: "var(--ui-text)", flexShrink: 0 }}>
                  {formatAmount(item.price, order.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator style={{ margin: "16px 0" }} />

      {/* Totals */}
      <section style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: "var(--ui-muted)" }}>Ukupno</span>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontWeight: 700, color: "var(--ui-text)", display: "block" }}>
              {formatCurrency(toBase(order.total, order.currency, exchangeRates), baseCurrency)}
            </span>
            {order.currency !== baseCurrency && (
              <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>
                {formatAmount(order.total, order.currency)}
              </span>
            )}
          </div>
        </div>
        {/stripe/i.test(order.payment_method ?? "") && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: "var(--ui-muted)" }}>Stripe naknada (5%)</span>
            <span style={{ color: "var(--tone-rose)" }}>
              −{formatCurrency(toBase(order.total * 0.05, order.currency, exchangeRates), baseCurrency)}
            </span>
          </div>
        )}
        {order.net_profit != null && order.net_profit > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--ui-muted)" }}>Neto zarada</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontWeight: 700, color: "var(--tone-green)", display: "block" }}>
                {formatCurrency(toBase(order.net_profit, order.currency, exchangeRates), baseCurrency)}
              </span>
              {order.currency !== baseCurrency && (
                <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>
                  {formatAmount(order.net_profit, order.currency)}
                </span>
              )}
            </div>
          </div>
        )}
        {order.payment_method && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8 }}>
            <span style={{ color: "var(--ui-faint)" }}>Način plaćanja</span>
            <span style={{ color: "var(--ui-muted)", fontWeight: 500 }}>
              {/stripe/i.test(order.payment_method)
                ? "Stripe (kreditna kartica)"
                : order.payment_method === "bacs"
                ? "Bankovna transakcija"
                : order.payment_method}
            </span>
          </div>
        )}
      </section>

      <Separator style={{ margin: "16px 0" }} />

      {/* Timestamps */}
      <section style={{ padding: "0 20px 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ui-faint)", marginBottom: 10 }}>
          Datumi
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--ui-faint)" }}>Kreirano</span>
            <span style={{ color: "var(--ui-muted)" }}>{fullDate(order.created_at)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--ui-faint)" }}>Ažurirano</span>
            <span style={{ color: "var(--ui-muted)" }}>{fullDate(order.updated_at)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── table row ──────────────────────────────────────────────────────────────────

function TableRow({
  order,
  onClick,
  baseCurrency,
  exchangeRates,
  subscriptionSeq,
}: {
  order: OrderRow;
  onClick: () => void;
  baseCurrency: string;
  exchangeRates: Record<string, number>;
  subscriptionSeq?: number | null;
}) {
  const firstItem  = order.order_items[0];
  const extraItems = order.order_items.length - 1;

  return (
    <tr
      onClick={onClick}
      style={{ cursor: "pointer", transition: "background 100ms", borderBottom: "1px solid var(--ui-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ui-sidebar)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* # */}
      <td style={{ padding: "10px 16px 10px 20px", width: 80, verticalAlign: "middle" }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--ui-muted)" }}>
          {order.woo_order_id ?? "—"}
        </span>
      </td>

      {/* Sajt */}
      <td style={{ padding: "10px 16px", width: 140, verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: order.sites?.color_hex ?? "var(--ui-border-strong)",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 12, color: "var(--ui-text-3)", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {order.sites?.name ?? "—"}
          </span>
        </div>
      </td>

      {/* Kupac */}
      <td style={{ padding: "10px 16px", verticalAlign: "middle", minWidth: 140 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 600, color: "var(--ui-text)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
          }}>
            {order.customer_name || "—"}
          </p>
          {order.customer_email && (
            <p style={{
              fontSize: 11, color: "var(--ui-faint)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
            }}>
              {order.customer_email}
            </p>
          )}
        </div>
      </td>

      {/* Proizvod */}
      <td style={{ padding: "10px 16px", verticalAlign: "middle", maxWidth: 200 }}>
        {firstItem ? (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{
                fontSize: 12, color: "var(--ui-text-3)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {firstItem.product_name}
              </span>
              {subscriptionSeq && <SubscriptionDots seq={subscriptionSeq} />}
            </div>
            {extraItems > 0 && (
              <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>+{extraItems} još</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--ui-faint)" }}>—</span>
        )}
      </td>

      {/* Tip */}
      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
        <ProductTypeTag type={order.product_type} />
      </td>

      {/* Status */}
      <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
        <StatusBadge status={order.status} />
      </td>

      {/* Iznos */}
      <td style={{ padding: "10px 20px 10px 16px", verticalAlign: "middle", textAlign: "right", minWidth: 100 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ui-text)", display: "block" }}>
          {formatCurrency(toBase(order.total, order.currency, exchangeRates), baseCurrency)}
        </span>
        {order.currency !== baseCurrency && (
          <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>
            {formatAmount(order.total, order.currency)}
          </span>
        )}
      </td>

      {/* Datum */}
      <td style={{ padding: "10px 20px 10px 16px", verticalAlign: "middle", width: 110 }}>
        <Tooltip>
          <TooltipTrigger style={{ cursor: "pointer" }}>
            <span style={{ fontSize: 12, color: "var(--ui-faint)", whiteSpace: "nowrap" }}>
              {relativeTime(order.created_at)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{fullDate(order.created_at)}</TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
}

// ── main export ────────────────────────────────────────────────────────────────

interface Props {
  orders: OrderRow[];
  baseCurrency?: string;
  exchangeRates?: Record<string, number>;
  subscriptionSeq?: Record<string, number>;
}

export function OrdersTableClient({
  orders,
  baseCurrency = "EUR",
  exchangeRates = {},
  subscriptionSeq = {},
}: Props) {
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [open, setOpen] = useState(false);

  function openSheet(order: OrderRow) {
    setSelected(order);
    setOpen(true);
  }

  return (
    <>
      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--ui-subtle)" }}>
              {["#", "Sajt", "Kupac", "Proizvod", "Tip", "Status", "Iznos", "Datum"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: i === 0 ? "10px 16px 10px 20px" : i === 7 ? "10px 20px 10px 16px" : "10px 16px",
                    textAlign: i === 6 ? "right" : "left",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--ui-faint)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center", color: "var(--ui-faint)", fontSize: 13 }}>
                  Nema porudžbina koje odgovaraju filterima
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <TableRow
                  key={order.id}
                  order={order}
                  onClick={() => openSheet(order)}
                  baseCurrency={baseCurrency}
                  exchangeRates={exchangeRates}
                  subscriptionSeq={subscriptionSeq[order.id]}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                  <SheetTitle>
                    Porudžbina {selected.woo_order_id ? `#${selected.woo_order_id}` : selected.id.slice(0, 8)}
                  </SheetTitle>
                  <StatusBadge status={selected.status} />
                </div>
                <SheetCloseButton />
              </SheetHeader>
              <OrderDetail
                order={selected}
                baseCurrency={baseCurrency}
                exchangeRates={exchangeRates}
                subscriptionSeq={subscriptionSeq[selected.id]}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
