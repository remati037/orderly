import { adminClient } from "@/lib/supabase/admin";

const GRAPH_VERSION = "v21.0";

interface InsightRow {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  date_start: string;
  date_stop: string;
}

interface GraphResponse {
  data?: InsightRow[];
  paging?: { next?: string };
  error?: { message: string };
}

export interface MetaSyncResult {
  rows: number;
  campaigns: number;
  error?: string;
}

// Pulls daily campaign-level spend for the given window and upserts it into
// ad_spend, refreshing campaign names in ad_campaign_map. Mapping (site/product)
// set by the user is preserved across syncs.
export async function syncMetaAccount(
  accountId: string,
  days = 30
): Promise<MetaSyncResult> {
  const supabase = adminClient();

  const { data: account, error: accErr } = await supabase
    .from("ad_accounts")
    .select("id, fb_account_id, access_token, currency")
    .eq("id", accountId)
    .single();

  if (accErr || !account)
    return { rows: 0, campaigns: 0, error: "Ad account not found" };

  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend",
    time_increment: "1",
    time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }),
    limit: "500",
    access_token: account.access_token,
  });

  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${account.fb_account_id}/insights?${params}`;
  const spendRows: { ad_account_id: string; campaign_id: string; date: string; spend: number; currency: string }[] = [];
  const campaigns = new Map<string, string>();

  // Follow pagination until exhausted (cap pages defensively).
  for (let page = 0; page < 50 && url; page++) {
    const res = await fetch(url);
    const json = (await res.json()) as GraphResponse;

    if (json.error)
      return { rows: 0, campaigns: 0, error: json.error.message };

    for (const row of json.data ?? []) {
      spendRows.push({
        ad_account_id: account.id,
        campaign_id: row.campaign_id,
        date: row.date_start,
        spend: Number(row.spend ?? 0),
        currency: account.currency,
      });
      campaigns.set(row.campaign_id, row.campaign_name);
    }

    url = json.paging?.next ?? "";
  }

  if (spendRows.length) {
    const { error } = await supabase
      .from("ad_spend")
      .upsert(spendRows, { onConflict: "ad_account_id,campaign_id,date" });
    if (error) return { rows: 0, campaigns: 0, error: error.message };
  }

  // Upsert campaign names without clobbering existing site/product mapping.
  for (const [campaign_id, campaign_name] of campaigns) {
    await supabase
      .from("ad_campaign_map")
      .upsert(
        { campaign_id, ad_account_id: account.id, campaign_name, updated_at: new Date().toISOString() },
        { onConflict: "campaign_id", ignoreDuplicates: false }
      );
  }

  await supabase
    .from("ad_accounts")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", account.id);

  return { rows: spendRows.length, campaigns: campaigns.size };
}
