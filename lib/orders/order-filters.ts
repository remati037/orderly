import { dayBounds, monthBounds, customBounds } from "@/lib/utils/tz";

// Filters shared by the /porudzbine table and its CSV export, parsed from the
// same URL params so the export always matches what's on screen.

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

export interface OrderFilters {
  siteIds: string[];
  platform?: string;
  status?: string;
  productType?: string;
  from?: string; // inclusive ISO
  to?: string;   // exclusive ISO
  q?: string;
}

function get(params: Params, key: string): string | undefined {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  return typeof v === "string" && v ? v : undefined;
}

// Belgrade-time boundaries — the server runs in UTC.
function presetToRange(preset: string): { from: string; to: string } | null {
  const range = (b: { start: string; end: string }) => ({ from: b.start, to: b.end });
  switch (preset) {
    case "today":      return range(dayBounds(0));
    case "yesterday":  return range(dayBounds(-1));
    case "7days":      return { from: dayBounds(-6).start, to: dayBounds(0).end };
    case "month":      return range(monthBounds(0));
    case "last_month": return range(monthBounds(-1));
    default:           return null;
  }
}

export function parseOrderFilters(params: Params): OrderFilters {
  const datePreset = get(params, "date_preset");
  const dateFrom   = get(params, "date_from");
  const dateTo     = get(params, "date_to");
  const range      = datePreset && datePreset !== "custom" ? presetToRange(datePreset) : null;

  return {
    siteIds:     (get(params, "sites") ?? "").split(",").filter(Boolean),
    platform:    get(params, "platform"),
    status:      get(params, "status"),
    productType: get(params, "product_type"),
    // Custom dates are YYYY-MM-DD in Belgrade time; `to` is exclusive (next midnight).
    from: range?.from ?? (dateFrom ? customBounds(dateFrom, dateFrom).start : undefined),
    to:   range?.to   ?? (dateTo   ? customBounds(dateTo, dateTo).end       : undefined),
    q:    get(params, "q")?.trim() || undefined,
  };
}

// Minimal structural type so this works with any PostgREST filter builder.
interface Filterable<T> {
  in(column: string, values: string[]): T;
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  or(filters: string): T;
}

export function applyOrderFilters<T extends Filterable<T>>(query: T, f: OrderFilters): T {
  let q = query;
  if (f.siteIds.length) q = q.in("site_id", f.siteIds);
  if (f.platform)       q = q.eq("source", f.platform);
  if (f.status)         q = q.eq("status", f.status);
  if (f.productType)    q = q.eq("product_type", f.productType);
  if (f.from)           q = q.gte("created_at", f.from);
  if (f.to)             q = q.lt("created_at", f.to);
  if (f.q) {
    // Characters that are syntax in a PostgREST or=() list are dropped.
    const term = f.q.replace(/[,()*%"\\]/g, " ").trim();
    if (term) {
      q = q.or(
        `customer_name.ilike.*${term}*,customer_email.ilike.*${term}*,woo_order_id.eq.${term.replace(/^#/, "")}`
      );
    }
  }
  return q;
}
