import { adminClient } from "@/lib/supabase/admin";
import { GRAPH_VERSION, syncMetaAccount } from "@/lib/sync/sync-meta-account";
import { parseInsightRow, type AdMeta, type GraphInsightRow } from "@/lib/ads/insights";

const INSIGHT_FIELDS =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,inline_link_clicks,ctr,cpm,actions,action_values";

// Everything that can still deliver or needs attention; archived and deleted
// ads are left out so the list stays small.
const AD_STATUSES = [
  "ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "DISAPPROVED", "WITH_ISSUES",
  "PENDING_REVIEW", "PREAPPROVED", "IN_PROCESS", "PENDING_BILLING_INFO",
];

interface GraphPage<T> {
  data?: T[];
  paging?: { next?: string };
  error?: { message: string };
}

interface GraphAd {
  id: string;
  name?: string;
  effective_status?: string;
  campaign?: { id: string; name?: string };
  adset?: { id: string; name?: string };
  creative?: { thumbnail_url?: string };
}

export interface MetaLiveResult {
  rows: number;
  error?: string;
}

async function fetchAllPages<T>(path: string, params: Record<string, string>, token: string): Promise<T[]> {
  const query = new URLSearchParams({ ...params, limit: "200", access_token: token });
  let url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}?${query}`;
  const rows: T[] = [];

  // Follow pagination until exhausted (cap pages defensively).
  for (let page = 0; page < 50 && url; page++) {
    const res = await fetch(url);
    const json = (await res.json()) as GraphPage<T>;
    if (json.error) throw new Error(json.error.message);
    rows.push(...(json.data ?? []));
    url = json.paging?.next ?? "";
  }
  return rows;
}

const dateIn = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

// Refreshes ad-level insights for one account, then ad_spend through the
// campaign-level sync: Meta leaves deleted ads out of ad-level rows, so their
// sum would understate spend that profit and KPI rely on.
// `backfillDays` loads past days once (Meta's last_30d or last_7d, without today).
export async function syncMetaLive(accountId: string, backfillDays?: 7 | 30): Promise<MetaLiveResult> {
  const supabase = adminClient();

  const { data: account, error: accErr } = await supabase
    .from("ad_accounts")
    .select("id, fb_account_id, access_token")
    .eq("id", accountId)
    .single();
  if (accErr || !account) return { rows: 0, error: "Ad account not found" };

  const { id, fb_account_id: act, access_token: token } = account;
  try {
    const infoRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${act}?${new URLSearchParams({ fields: "account_status,timezone_name", access_token: token })}`
    );
    const info = (await infoRes.json()) as { account_status?: number; timezone_name?: string; error?: { message: string } };
    if (info.error) throw new Error(info.error.message);

    const ads = await fetchAllPages<GraphAd>(`${act}/ads`, {
      fields: "id,name,effective_status,campaign{id,name},adset{id,name},creative{thumbnail_url}",
      effective_status: JSON.stringify(AD_STATUSES),
    }, token);
    const metaByAd = new Map<string, AdMeta>(
      ads.map((a) => [a.id, { status: a.effective_status ?? null, thumbnail: a.creative?.thumbnail_url ?? null }])
    );

    const presets = backfillDays ? [`last_${backfillDays}d`] : ["today", "yesterday"];
    const insightPages = await Promise.all(
      presets.map((date_preset) =>
        fetchAllPages<GraphInsightRow>(`${act}/insights`, {
          level: "ad", date_preset, time_increment: "1", fields: INSIGHT_FIELDS,
        }, token)
      )
    );
    const rows = insightPages.flat().map((r) => parseInsightRow(r, id, metaByAd.get(r.ad_id)));

    // Active ads with no delivery today get a zero row, so a campaign that
    // should be running but isn't still shows up on the page.
    if (!backfillDays) {
      const today = dateIn(info.timezone_name ?? "Europe/Belgrade");
      const seen = new Set(rows.filter((r) => r.date === today).map((r) => r.ad_id));
      for (const ad of ads) {
        if (ad.effective_status !== "ACTIVE" || seen.has(ad.id) || !ad.campaign) continue;
        rows.push(parseInsightRow({
          campaign_id: ad.campaign.id,
          campaign_name: ad.campaign.name,
          adset_id: ad.adset?.id,
          adset_name: ad.adset?.name,
          ad_id: ad.id,
          ad_name: ad.name,
          date_start: today,
        }, id, metaByAd.get(ad.id)));
      }
    }

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("ad_insights_daily")
        .upsert(rows.slice(i, i + 500), { onConflict: "ad_id,date" });
      if (error) throw new Error(error.message);
    }

    const spend = await syncMetaAccount(id, backfillDays ?? 2);
    if (spend.error) throw new Error(spend.error);

    await supabase
      .from("ad_accounts")
      .update({
        meta_account_status: info.account_status ?? null,
        live_synced_at: new Date().toISOString(),
        live_sync_error: null,
      })
      .eq("id", id);

    return { rows: rows.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await supabase.from("ad_accounts").update({ live_sync_error: error }).eq("id", id);
    return { rows: 0, error };
  }
}
