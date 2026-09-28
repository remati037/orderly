import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") ?? "total_spent";
  const order = searchParams.get("order") ?? "desc";
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  // Characters that are syntax in a PostgREST or=() list are dropped.
  const q = (searchParams.get("q") ?? "").replace(/[,()*%"\\]/g, " ").trim();

  const supabase = adminClient();

  const allowedSortFields = ["total_spent", "order_count", "last_order_at", "first_order_at", "name"];
  const safeSort = allowedSortFields.includes(sort) ? sort : "total_spent";

  let query = supabase
    .from("customers")
    .select("id, email, name, city, order_count, total_spent, first_order_at, last_order_at", { count: "exact" })
    .order(safeSort, { ascending: order === "asc", nullsFirst: false })
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (q) query = query.or(`name.ilike.*${q}*,email.ilike.*${q}*,city.ilike.*${q}*`);

  const { data: customers, count, error } = await query;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const total = count ?? 0;
  if (!customers || customers.length === 0)
    return NextResponse.json({ customers: [], total, page, page_size: pageSize });

  // Get primary site per customer (site with most orders per email)
  const emails = customers.map((c) => c.email).filter(Boolean) as string[];

  const { data: orderSites } = await fetchAll(() =>
    supabase
      .from("orders")
      .select("customer_email, site_id, sites(name, color_hex, platform)")
      .in("customer_email", emails)
      .in("status", COUNTED_STATUSES)
      .order("id")
  );

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
    // Stored in the base currency by upsertCustomer / migration 017.
    const totalSpentEur = Number(c.total_spent ?? 0);
    const ltv_score = Math.round(totalSpentEur / monthsSinceFirst);
    const segment =
      totalSpentEur >= 500
        ? "VIP"
        : totalSpentEur >= 100
        ? "Regular"
        : "New";

    return {
      ...c,
      total_spent: totalSpentEur,
      ltv_score,
      segment,
      primary_site: c.email ? (primarySite[c.email] ?? null) : null,
    };
  });

  return NextResponse.json({ customers: result, total, page, page_size: pageSize });
}
