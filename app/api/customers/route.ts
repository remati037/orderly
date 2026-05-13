import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") ?? "total_spent";
  const order = searchParams.get("order") ?? "desc";
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 150)));

  const supabase = adminClient();

  const allowedSortFields = ["total_spent", "order_count", "last_order_at", "first_order_at", "name"];
  const safeSort = allowedSortFields.includes(sort) ? sort : "total_spent";

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, email, name, city, order_count, total_spent, first_order_at, last_order_at")
    .order(safeSort, { ascending: order === "asc" })
    .limit(limit);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  if (!customers || customers.length === 0)
    return NextResponse.json({ customers: [] });

  // Get primary site per customer (site with most orders per email)
  const emails = customers.map((c) => c.email).filter(Boolean) as string[];

  const { data: orderSites } = await supabase
    .from("orders")
    .select("customer_email, site_id, sites(name, color_hex, platform)")
    .in("customer_email", emails)
    .not("status", "in", "(cancelled,refunded)");

  // Aggregate: email → siteId → { count, name, color, platform }
  type SiteInfo = { count: number; name: string; color: string; platform: string };
  const sitesByEmail: Record<string, Record<string, SiteInfo>> = {};

  for (const row of orderSites ?? []) {
    const email = row.customer_email;
    if (!email) continue;
    const site = row.sites as unknown as { name: string; color_hex: string; platform: string } | null;
    if (!site || !row.site_id) continue;

    if (!sitesByEmail[email]) sitesByEmail[email] = {};
    const entry = sitesByEmail[email][row.site_id];
    if (entry) {
      entry.count++;
    } else {
      sitesByEmail[email][row.site_id] = {
        count: 1,
        name: site.name,
        color: site.color_hex,
        platform: site.platform,
      };
    }
  }

  const primarySite: Record<string, SiteInfo> = {};
  for (const [email, sites] of Object.entries(sitesByEmail)) {
    const best = Object.values(sites).sort((a, b) => b.count - a.count)[0];
    if (best) primarySite[email] = best;
  }

  const now = Date.now();

  const result = customers.map((c) => {
    const monthsSinceFirst = c.first_order_at
      ? Math.max(1, (now - new Date(c.first_order_at).getTime()) / (30 * 24 * 3600 * 1000))
      : 1;
    const ltv_score = Math.round((c.total_spent ?? 0) / monthsSinceFirst);
    const segment =
      (c.total_spent ?? 0) >= 50_000
        ? "VIP"
        : (c.total_spent ?? 0) >= 10_000
        ? "Regular"
        : "New";

    return {
      ...c,
      ltv_score,
      segment,
      primary_site: c.email ? (primarySite[c.email] ?? null) : null,
    };
  });

  return NextResponse.json({ customers: result });
}
