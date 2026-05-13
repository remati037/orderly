import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { OrdersTableClient, type OrderRow } from "./orders-table-client";

// ── constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ── date preset helpers ────────────────────────────────────────────────────────

function dayStart(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function presetToRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  switch (preset) {
    case "today": {
      const s = dayStart(0);
      const e = dayStart(1);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    case "yesterday": {
      const s = dayStart(-1);
      const e = dayStart(0);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    case "7days": {
      const s = dayStart(-6);
      const e = dayStart(1);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      return { from: s, to: e };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const e = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return { from: s, to: e };
    }
    default:
      return null;
  }
}

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
  return `/dashboard${qs ? `?${qs}` : ""}`;
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
  const sitesParam  = typeof params.sites === "string" ? params.sites : "";
  const siteIds     = sitesParam.split(",").filter(Boolean);
  const platform    = typeof params.platform === "string" ? params.platform : undefined;
  const status      = typeof params.status === "string" ? params.status : undefined;
  const productType = typeof params.product_type === "string" ? params.product_type : undefined;
  const datePreset  = typeof params.date_preset === "string" ? params.date_preset : undefined;
  const dateFrom    = typeof params.date_from === "string" ? params.date_from : undefined;
  const dateTo      = typeof params.date_to === "string" ? params.date_to : undefined;

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);

  let query = supabase
    .from("orders")
    .select(
      "id, woo_order_id, source, status, total, net_profit, currency, customer_name, customer_email, customer_city, product_type, created_at, updated_at, sites(name, color_hex), order_items(product_name, product_type, quantity, price)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (siteIds.length > 0) query = query.in("site_id", siteIds);
  if (platform)            query = query.eq("source", platform);
  if (status)              query = query.eq("status", status);
  if (productType)         query = query.eq("product_type", productType);

  // Date range
  const dateRange = datePreset && datePreset !== "custom" ? presetToRange(datePreset) : null;
  const fromDate  = dateRange?.from ?? (dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined);
  const toDate    = dateRange?.to   ?? (dateTo   ? `${dateTo}T23:59:59.999Z`   : undefined);
  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate)   query = query.lte("created_at", toDate);

  const { data, count, error } = await query;

  const orders  = (data ?? []) as unknown as OrderRow[];
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
