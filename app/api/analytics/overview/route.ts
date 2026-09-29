import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadFxSettings, toBase } from "@/lib/utils/fx";
import { monthBounds } from "@/lib/utils/tz";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

export const maxDuration = 60;

type Row = {
  site_id: string;
  status: string;
  total: number | null;
  currency: string | null;
  customer_email: string | null;
  customer_city: string | null;
  created_at: string;
};

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Belgrade", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short",
});

// Belgrade calendar parts of an instant.
function belgrade(iso: string) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const y = Number(p.year), m = Number(p.month), d = Number(p.day);
  const weekday = WEEKDAYS[p.weekday] ?? 0;
  const monday = new Date(Date.UTC(y, m - 1, d - weekday));
  return {
    month: `${y}-${p.month}`,
    week: monday.toISOString().slice(0, 10),
    weekday,
    hour: Number(p.hour),
  };
}

const SUCCESS = new Set<string>(COUNTED_STATUSES);

// Customers type cities freely ("Beograd", "Belgrade", "Nis", "Niš") — group
// them by a diacritic-free lowercase key plus a few English aliases, and
// show the spelling with diacritics when one was seen.
const CITY_ALIASES: Record<string, string> = { belgrade: "beograd", "novi sad": "novi sad", nish: "nis" };
function cityKey(city: string): string {
  const k = city
    .toLocaleLowerCase("sr")
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return CITY_ALIASES[k] ?? k;
}
const hasDiacritics = (s: string) => /[čćšžđČĆŠŽĐ]/.test(s);

// Everything the Analytics page needs beyond the KPIs, from one pass over the
// last N months of orders (Belgrade calendar, base currency):
//   monthly revenue / orders / AOV per site, new vs returning revenue,
//   weekly payment success rate, weekday × hour heatmap, top cities.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const sp = new URL(request.url).searchParams;
  const months = [3, 6, 12].includes(Number(sp.get("months"))) ? Number(sp.get("months")) : 12;
  const siteId = sp.get("siteId");
  const from = monthBounds(-(months - 1)).start;

  const supabase = adminClient();
  const [fx, sitesRes, ordersRes, firstsRes] = await Promise.all([
    loadFxSettings(supabase),
    supabase.from("sites").select("id, name, color_hex, created_at").order("created_at"),
    fetchAll<Row>(() => {
      let q = supabase
        .from("orders")
        .select("site_id, status, total, currency, customer_email, customer_city, created_at")
        .gte("created_at", from)
        .order("id");
      if (siteId) q = q.eq("site_id", siteId);
      return q;
    }),
    // Every paid order ever, to know each customer's first purchase.
    fetchAll<{ customer_email: string | null; created_at: string }>(() =>
      supabase
        .from("orders")
        .select("customer_email, created_at")
        .in("status", COUNTED_STATUSES)
        .not("customer_email", "is", null)
        .order("id")
    ),
  ]);
  if (ordersRes.error || firstsRes.error)
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });

  const firstPurchase = new Map<string, string>();
  for (const o of firstsRes.data) {
    const email = o.customer_email!.trim().toLowerCase();
    const prev = firstPurchase.get(email);
    if (!prev || new Date(o.created_at) < new Date(prev)) firstPurchase.set(email, o.created_at);
  }

  // Month keys oldest → newest.
  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i--) monthKeys.push(belgrade(monthBounds(-i).start).month);
  const mIdx = new Map(monthKeys.map((k, i) => [k, i]));
  const zeros = () => monthKeys.map(() => 0);

  const bySite = new Map<string, { revenue: number[]; orders: number[] }>();
  const newRevenue = zeros(), returningRevenue = zeros(), newCustomers = zeros(), returningOrders = zeros();
  const weeks = new Map<string, { success: number; failed: number }>();
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const heatOrders = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const cities = new Map<string, { name: string; revenue: number; orders: number }>();

  for (const o of ordersRes.data) {
    const b = belgrade(o.created_at);

    if (o.status === "failed" || SUCCESS.has(o.status)) {
      const w = weeks.get(b.week) ?? { success: 0, failed: 0 };
      if (o.status === "failed") w.failed++; else w.success++;
      weeks.set(b.week, w);
    }
    if (!SUCCESS.has(o.status)) continue;

    const i = mIdx.get(b.month);
    if (i === undefined) continue;
    const amount = toBase(o.total ?? 0, o.currency ?? "RSD", fx.rates);

    const s = bySite.get(o.site_id) ?? { revenue: zeros(), orders: zeros() };
    s.revenue[i] += amount;
    s.orders[i] += 1;
    bySite.set(o.site_id, s);

    const email = o.customer_email?.trim().toLowerCase();
    const first = email ? firstPurchase.get(email) : undefined;
    if (!first || new Date(first).getTime() === new Date(o.created_at).getTime()) {
      newRevenue[i] += amount;
      newCustomers[i] += 1;
    } else {
      returningRevenue[i] += amount;
      returningOrders[i] += 1;
    }

    heat[b.weekday][b.hour] += amount;
    heatOrders[b.weekday][b.hour] += 1;

    const city = o.customer_city?.trim();
    if (city) {
      const key = cityKey(city);
      const c = cities.get(key) ?? { name: city, revenue: 0, orders: 0 };
      if (hasDiacritics(city) && !hasDiacritics(c.name)) c.name = city;
      if (key === "beograd") c.name = "Beograd";
      c.revenue += amount;
      c.orders += 1;
      cities.set(key, c);
    }
  }

  const sites = (sitesRes.data ?? [])
    .filter((s) => bySite.has(s.id))
    .map((s) => {
      const d = bySite.get(s.id)!;
      return {
        site_id: s.id,
        name: s.name,
        color: s.color_hex,
        revenue: d.revenue,
        orders: d.orders,
        aov: d.revenue.map((r, i) => (d.orders[i] ? r / d.orders[i] : null)),
      };
    });

  const weekKeys = [...weeks.keys()].sort();
  return NextResponse.json({
    base_currency: fx.baseCurrency,
    months: monthKeys,
    sites,
    customers: {
      new_revenue: newRevenue,
      returning_revenue: returningRevenue,
      new_customers: newCustomers,
      returning_orders: returningOrders,
    },
    payments: weekKeys.map((w) => {
      const { success, failed } = weeks.get(w)!;
      return { week: w, success, failed, rate: success + failed ? success / (success + failed) : null };
    }),
    heatmap: { revenue: heat, orders: heatOrders },
    cities: [...cities.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  });
}
