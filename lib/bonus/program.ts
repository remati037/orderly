// Black Friday bonus: config lives in settings.bonus_program (migration 030).

export interface BonusTier {
  /** Counted revenue (base currency) from which this tier applies. */
  from: number;
  /** Total team bonus exactly at `from`. */
  amount: number;
}

export interface BonusProgram {
  name: string;
  /** First and last counted day, "YYYY-MM-DD" in Belgrade time (inclusive). */
  from: string;
  to: string;
  /** People the total bonus is split between. */
  people: number;
  /** site_id → share of its revenue that counts (partners 0.5); missing = 1. */
  site_shares: Record<string, number>;
  /** site_id → product name → goal for its counted revenue (after the share). */
  product_goals?: Record<string, Record<string, number>>;
  tiers: BonusTier[];
}

export interface BonusResult {
  /** Index into tiers of the tier reached, or -1 below the first one. */
  tierIndex: number;
  /** Bonus percentage of counted revenue for the reached tier (0.06 = 6%). */
  rate: number;
  total: number;
  perPerson: number;
}

export function siteShare(program: BonusProgram, siteId: string): number {
  return program.site_shares[siteId] ?? 1;
}

export function sortedTiers(program: BonusProgram): BonusTier[] {
  return [...program.tiers].sort((a, b) => a.from - b.from);
}

/** A tier's percentage: the share of revenue its amount is at its threshold. */
export function tierRate(t: BonusTier): number {
  return t.from > 0 ? t.amount / t.from : 0;
}

/**
 * Bonus for a counted revenue: the reached tier's percentage × revenue, so
 * 95.000 € at the 90k tier (3%) gives 2.850 €. The last tier is a flat cap.
 */
export function computeBonus(program: BonusProgram, revenue: number): BonusResult {
  const tiers = sortedTiers(program);
  let tierIndex = -1;
  for (let i = 0; i < tiers.length; i++) if (revenue >= tiers[i].from) tierIndex = i;
  if (tierIndex < 0) return { tierIndex, rate: 0, total: 0, perPerson: 0 };

  const tier = tiers[tierIndex];
  const rate = tierRate(tier);
  const total = tierIndex === tiers.length - 1 ? tier.amount : rate * revenue;
  return { tierIndex, rate, total, perPerson: program.people > 0 ? total / program.people : 0 };
}
