import { SupabaseClient } from "@supabase/supabase-js";

export interface FxSettings {
  baseCurrency: string;
  rates: Record<string, number>;
}

export const DEFAULT_RATES: Record<string, number> = { EUR: 1, RSD: 0.00855, USD: 0.92 };

export async function loadFxSettings(supabase: SupabaseClient): Promise<FxSettings> {
  const [{ data: bc }, { data: ratesRow }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "base_currency").maybeSingle(),
    supabase.from("settings").select("value").eq("key", "exchange_rates").maybeSingle(),
  ]);
  return {
    baseCurrency: (bc?.value as string) ?? "EUR",
    rates: (ratesRow?.value as Record<string, number>) ?? DEFAULT_RATES,
  };
}

export function toBase(
  amount: number,
  currency: string,
  rates: Record<string, number>
): number {
  return amount * (rates[currency] ?? 1);
}
