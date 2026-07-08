// Statuses that count as real revenue. Everything else — pending, on-hold,
// checkout-draft, draft, cancelled, refunded, failed — is excluded from all
// revenue / order / profit aggregations.
//
// WooCommerce stores its native status verbatim; Thinkific orders are
// normalized to "completed" or "pending", so "completed" + "processing"
// covers every valid order from both sources.
export const COUNTED_STATUSES = ["completed", "processing"] as const;

// Postgrest `.in()` list literal, e.g. for `.filter("status", "in", COUNTED_STATUSES_SQL)`.
export const COUNTED_STATUSES_SQL = `(${COUNTED_STATUSES.join(",")})`;
