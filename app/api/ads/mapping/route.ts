import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";

// GET: campaigns (with current mapping + last-30d spend) plus the sites and
// products available as mapping targets.
export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();

  const [mapRes, sitesRes, itemsRes, spendRes] = await Promise.all([
    supabase
      .from("ad_campaign_map")
      .select("campaign_id, campaign_name, site_id, product_name, ad_account_id"),
    supabase.from("sites").select("id, name, color_hex").order("name"),
    supabase
      .from("order_items")
      .select("product_name, order:orders!inner(site_id)")
      .not("product_name", "is", null),
    supabase.from("ad_spend").select("campaign_id, spend"),
  ]);

  // Sum spend per campaign (all-time stored, typically last sync window).
  const spendByCampaign = new Map<string, number>();
  for (const r of spendRes.data ?? []) {
    spendByCampaign.set(r.campaign_id, (spendByCampaign.get(r.campaign_id) ?? 0) + Number(r.spend ?? 0));
  }

  // Distinct products per site for the dropdown.
  const productsBySite: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const item of itemsRes.data ?? []) {
    const siteId = (item.order as unknown as { site_id: string } | null)?.site_id;
    if (!siteId || !item.product_name) continue;
    const key = `${siteId}::${item.product_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (productsBySite[siteId] ??= []).push(item.product_name);
  }
  for (const list of Object.values(productsBySite)) list.sort();

  const campaigns = (mapRes.data ?? [])
    .map((c) => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      site_id: c.site_id,
      product_name: c.product_name,
      spend: Math.round((spendByCampaign.get(c.campaign_id) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    campaigns,
    sites: sitesRes.data ?? [],
    products_by_site: productsBySite,
  });
}

// POST: save the mapping for one campaign.
export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { campaign_id, site_id, product_name } = await request.json();
  if (!campaign_id)
    return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase
    .from("ad_campaign_map")
    .update({
      site_id: site_id || null,
      product_name: product_name || null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaign_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
