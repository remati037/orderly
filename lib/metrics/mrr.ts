import { toBase } from "@/lib/utils/fx";

export interface MrrSubscription {
  status: string | null;
  mrr: number | null;            // base currency, frozen at sync time (legacy)
  mrr_amount?: number | null;    // as charged
  mrr_currency?: string | null;
  started_at: string | null;
  cancelled_at?: string | null;
}

/**
 * Monthly amount of one subscription in the base currency, at today's rates.
 * Rows synced before migration 026 only have the frozen base value.
 */
export function subscriptionMrr(sub: MrrSubscription, rates: Record<string, number>): number {
  if (sub.mrr_amount != null && sub.mrr_currency)
    return toBase(Number(sub.mrr_amount), sub.mrr_currency, rates);
  return Number(sub.mrr ?? 0);
}

/** Active now: what counts toward MRR. Trials don't pay yet. */
export const isActive = (s: MrrSubscription) => s.status === "active";

export function currentMrr(subs: MrrSubscription[], rates: Record<string, number>): number {
  return subs.filter(isActive).reduce((sum, s) => sum + subscriptionMrr(s, rates), 0);
}

/**
 * MRR as it stood at `at`: started before it and not cancelled by then.
 * Status alone can't answer this for the past — a sub cancelled last week was
 * still paying in last month's MRR.
 */
export function mrrAt(subs: MrrSubscription[], at: string, rates: Record<string, number>): number {
  return subs
    .filter((s) =>
      s.status !== "trial" &&
      !!s.started_at && s.started_at < at &&
      (s.status === "active" || (s.cancelled_at != null && s.cancelled_at >= at))
    )
    .reduce((sum, s) => sum + subscriptionMrr(s, rates), 0);
}
