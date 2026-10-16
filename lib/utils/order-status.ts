// Orders that are paid and NOT refunded (status-wise). This is not the revenue
// definition: revenue / order / profit numbers use PAID_STATUSES from
// lib/metrics (which also counts "refunded" orders and subtracts the refunds).
// Use this only where "paid and kept" is really meant — e.g. a customer's
// order count (refresh_customer_totals, migration 025) or profit recalculation.
//
// WooCommerce stores its native status verbatim; Thinkific orders are
// normalized to "completed" or "pending", so "completed" + "processing"
// covers every valid order from both sources.
export const COUNTED_STATUSES = ["completed", "processing"] as const;

// Postgrest `.in()` list literal, e.g. for `.filter("status", "in", COUNTED_STATUSES_SQL)`.
export const COUNTED_STATUSES_SQL = `(${COUNTED_STATUSES.join(",")})`;
