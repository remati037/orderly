import { adminClient } from "@/lib/supabase/admin";
import { toBase } from "@/lib/utils/fx";

export interface MappedSpend {
  total: number;                              // total mapped spend in base currency
  bySite: Record<string, number>;             // site_id -> spend
  byProduct: Record<string, number>;          // "site_id::product_name" -> spend
}

// Aggregates mapped ad spend over [from, to) into base currency, joining
// ad_spend with the user's campaign → site/product mapping. Unmapped
// campaigns (no site_id) are ignored so they don't distort per-product profit.
export async function getMappedSpend(
  supabase: ReturnType<typeof adminClient>,
  from: string,
  to: string,
  rates: Record<string, number>,
  siteId?: string | null
): Promise<MappedSpend> {
  const { data: spendRows } = await supabase
    .from("ad_spend")
    .select("campaign_id, spend, currency, date")
    .gte("date", from)
    .lt("date", to);

  const { data: mapRows } = await supabase
    .from("ad_campaign_map")
    .select("campaign_id, site_id, product_name");

  const mapByCampaign = new Map(
    (mapRows ?? []).map((m) => [m.campaign_id, m])
  );

  const result: MappedSpend = { total: 0, bySite: {}, byProduct: {} };

  for (const row of spendRows ?? []) {
    const mapping = mapByCampaign.get(row.campaign_id);
    if (!mapping?.site_id) continue;                 // unmapped → skip
    if (siteId && mapping.site_id !== siteId) continue;

    const amount = toBase(Number(row.spend ?? 0), row.currency ?? "EUR", rates);
    result.total += amount;
    result.bySite[mapping.site_id] = (result.bySite[mapping.site_id] ?? 0) + amount;

    if (mapping.product_name) {
      const key = `${mapping.site_id}::${mapping.product_name}`;
      result.byProduct[key] = (result.byProduct[key] ?? 0) + amount;
    }
  }

  return result;
}
