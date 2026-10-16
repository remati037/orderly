// The metric registry: every number Orderly shows is defined here, once.
// KPI cards, goals, digests, segments and the AI assistant all read these
// definitions, so the same metric can never mean two things in two places.

/** Orders the customer actually paid for, including ones refunded later. */
export const PAID_STATUSES = ["completed", "processing", "refunded"] as const;
export const PAID_STATUSES_SQL = `(${PAID_STATUSES.join(",")})`;

/** Default organization until Orderly has sign-up (Faza 5). */
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export type MetricKey =
  | "gross_sales" | "refunds" | "net_revenue" | "orders" | "aov"
  | "net_profit" | "processor_fees" | "refund_count" | "mrr" | "arr" | "active_subscriptions";

export interface MetricDefinition {
  key: MetricKey;
  label: string;        // Serbian UI label
  description: string;  // what exactly is counted
  format: "money" | "count" | "percent";
  /** true when "up" is good (for trend colours, goals, AI "growth" answers) */
  higherIsBetter: boolean;
}

export const METRICS: Record<MetricKey, MetricDefinition> = {
  gross_sales: {
    key: "gross_sales", label: "Bruto prodaja", format: "money", higherIsBetter: true,
    description: "Zbir plaćenih porudžbina (completed, processing, refunded) kreiranih u periodu.",
  },
  refunds: {
    key: "refunds", label: "Refundacije", format: "money", higherIsBetter: false,
    description: "Zbir refundacija izvršenih u periodu (po datumu refundacije, ne porudžbine).",
  },
  net_revenue: {
    key: "net_revenue", label: "Neto prihod", format: "money", higherIsBetter: true,
    description: "Bruto prodaja − refundacije u periodu. Porezi, dostava i naknade su 0 za digitalne proizvode.",
  },
  orders: {
    key: "orders", label: "Porudžbine", format: "count", higherIsBetter: true,
    description: "Broj plaćenih porudžbina kreiranih u periodu (i one kasnije refundirane).",
  },
  aov: {
    key: "aov", label: "Prosečna porudžbina", format: "money", higherIsBetter: true,
    description: "Neto prihod ÷ broj porudžbina.",
  },
  net_profit: {
    key: "net_profit", label: "Neto zarada", format: "money", higherIsBetter: true,
    description: "Zarada plaćenih porudžbina (marža / trošak proizvoda, minus Stripe naknada) minus udeo zarade u refundacijama.",
  },
  processor_fees: {
    key: "processor_fees", label: "Stripe naknade", format: "money", higherIsBetter: false,
    description: "Stvarna Stripe naknada kad je poznata, inače procena 5% za kartična plaćanja.",
  },
  refund_count: {
    key: "refund_count", label: "Broj refundacija", format: "count", higherIsBetter: false,
    description: "Broj refundacija izvršenih u periodu.",
  },
  mrr: {
    key: "mrr", label: "MRR", format: "money", higherIsBetter: true,
    description: "Mesečni iznos aktivnih pretplata (godišnje ÷ 12), konvertovan trenutnim kursom u osnovnu valutu.",
  },
  arr: {
    key: "arr", label: "ARR", format: "money", higherIsBetter: true,
    description: "MRR × 12.",
  },
  active_subscriptions: {
    key: "active_subscriptions", label: "Aktivne pretplate", format: "count", higherIsBetter: true,
    description: "Pretplate u statusu active (uključujući past_due dok Stripe ponavlja naplatu).",
  },
};
