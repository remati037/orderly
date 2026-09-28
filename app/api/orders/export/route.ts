import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { parseOrderFilters, applyOrderFilters } from "@/lib/orders/order-filters";

export const maxDuration = 60;

const belgrade = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Belgrade",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// RFC 4180 quoting; also neutralises spreadsheet formula injection (=, +, -, @).
function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

type Row = {
  woo_order_id: string | null;
  created_at: string;
  status: string;
  source: string;
  total: number | null;
  net_profit: number | null;
  currency: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  payment_method: string | null;
  sites: { name: string } | null;
  order_items: { product_name: string; quantity: number | null }[] | null;
};

// CSV of every order matching the /porudzbine filters (same URL params).
// Semicolon-separated with a BOM so Excel with Serbian locale opens it directly.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const filters = parseOrderFilters(new URL(request.url).searchParams);
  const supabase = adminClient();

  const { data, error } = await fetchAll<Row>(() =>
    applyOrderFilters(
      // Untyped builder: the generic filter helper + nested select blow up TS inference.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("orders")
        .select(
          "woo_order_id, created_at, status, source, total, net_profit, currency, customer_name, customer_email, customer_city, payment_method, sites(name), order_items(product_name, quantity)"
        ),
      filters
    )
      .order("created_at", { ascending: false })
      .order("id")
  );
  if (error) return NextResponse.json({ error: (error as Error).message }, { status: 500 });

  const header = [
    "Datum", "Sajt", "Broj porudžbine", "Status", "Izvor", "Kupac", "Email", "Grad",
    "Proizvodi", "Iznos", "Valuta", "Neto zarada", "Način plaćanja",
  ];
  const lines = data.map((o) =>
    [
      belgrade.format(new Date(o.created_at)),
      o.sites?.name,
      o.woo_order_id,
      o.status,
      o.source,
      o.customer_name,
      o.customer_email,
      o.customer_city,
      (o.order_items ?? []).map((i) => (i.quantity && i.quantity > 1 ? `${i.product_name} ×${i.quantity}` : i.product_name)).join(", "),
      o.total != null ? String(o.total).replace(".", ",") : "",
      o.currency,
      o.net_profit != null ? String(o.net_profit).replace(".", ",") : "",
      o.payment_method,
    ].map(cell).join(";")
  );

  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade" }).format(new Date());

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="porudzbine-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
