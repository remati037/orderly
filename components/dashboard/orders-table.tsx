import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { parseOrderFilters, applyOrderFilters } from "@/lib/orders/order-filters";
import { computeSubscriptionOrdinals } from "@/lib/utils/subscription-ordinal";
import { OrdersTableClient, type OrderRow } from "./orders-table-client";

// ── constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ── pagination URL helper ──────────────────────────────────────────────────────

function pageUrl(
  params: Record<string, string | string[] | undefined>,
  page: number
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") sp.set(k, Array.isArray(v) ? v.join(",") : v);
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return `/porudzbine${qs ? `?${qs}` : ""}`;
}

// ── number formatting ──────────────────────────────────────────────────────────

function serbianCount(n: number): string {
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 14) return `${n.toLocaleString("sr-RS")} porudžbina`;
  const last1 = n % 10;
  if (last1 === 1) return `${n.toLocaleString("sr-RS")} porudžbina`;
  if (last1 >= 2 && last1 <= 4) return `${n.toLocaleString("sr-RS")} porudžbine`;
  return `${n.toLocaleString("sr-RS")} porudžbina`;
}

// ── main component ─────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function OrdersTable({ searchParams }: Props) {
  const params = await searchParams;

  const page        = Math.max(1, Number(params.page ?? 1));
  const filters     = parseOrderFilters(params);

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  let query = supabase
    .from("orders")
    .select(
      "id, woo_order_id, source, status, total, net_profit, currency, customer_name, customer_email, customer_city, product_type, payment_method, created_at, updated_at, sites(name, color_hex), order_items(product_name, product_type, quantity, price)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  query = applyOrderFilters(query, filters);

  const { data, count, error } = await query;

  const orders  = (data ?? []) as unknown as OrderRow[];

  const subscriptionSeqMap = await computeSubscriptionOrdinals(
    supabase,
    orders.map((o) => ({
      id: o.id,
      customer_email: o.customer_email ?? null,
      product_name: o.order_items?.[0]?.product_name ?? null,
      created_at: o.created_at,
    }))
  );
  const subscriptionSeq = Object.fromEntries(subscriptionSeqMap);
  const total   = count ?? 0;
  const pages   = Math.ceil(total / PAGE_SIZE);
  const from    = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to      = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E4E4E7",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid #F4F4F5",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
          Porudžbine
        </span>
        {!error && (
          <span style={{ fontSize: 12, color: "#A1A1AA" }}>
            {serbianCount(total)}
          </span>
        )}
      </div>

      {error ? (
        <div style={{ padding: "48px 20px", textAlign: "center", color: "#A1A1AA", fontSize: 13 }}>
          Greška pri učitavanju porudžbina
        </div>
      ) : (
        <>
          <OrdersTableClient
            orders={orders}
            baseCurrency={fx.baseCurrency}
            exchangeRates={fx.rates}
            subscriptionSeq={subscriptionSeq}
          />

          {/* pagination */}
          {total > PAGE_SIZE && (
            <div style={{
              padding: "12px 20px",
              borderTop: "1px solid #F4F4F5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}>
              <span style={{ fontSize: 12, color: "#71717A" }}>
                Prikazano {from}–{to} od {total.toLocaleString("sr-RS")} porudžbina
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {page > 1 ? (
                  <Link
                    href={pageUrl(params, page - 1)}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                      border: "1px solid #E4E4E7", color: "#52525B",
                      textDecoration: "none", background: "#fff",
                    }}
                  >
                    ← Nazad
                  </Link>
                ) : (
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: "1px solid #F4F4F5", color: "#D4D4D8",
                    background: "#FAFAFA", cursor: "not-allowed",
                  }}>
                    ← Nazad
                  </span>
                )}

                {page < pages ? (
                  <Link
                    href={pageUrl(params, page + 1)}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                      border: "1px solid #E4E4E7", color: "#52525B",
                      textDecoration: "none", background: "#fff",
                    }}
                  >
                    Napred →
                  </Link>
                ) : (
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: "1px solid #F4F4F5", color: "#D4D4D8",
                    background: "#FAFAFA", cursor: "not-allowed",
                  }}>
                    Napred →
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
