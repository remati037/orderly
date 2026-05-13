import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days") ?? 30)));
  const siteId = searchParams.get("siteId");

  const supabase = adminClient();

  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  let query = supabase
    .from("orders")
    .select("site_id, total, created_at")
    .gte("created_at", from.toISOString())
    .not("status", "in", "(cancelled,refunded)")
    .order("created_at");

  if (siteId) query = query.eq("site_id", siteId);

  const [ordersRes, sitesRes] = await Promise.all([
    query,
    supabase.from("sites").select("id, name, color_hex"),
  ]);

  if (ordersRes.error)
    return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });

  const orders = ordersRes.data ?? [];
  const sites = sitesRes.data ?? [];

  // Build date range labels DD.MM
  const dateLabels: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    dateLabels.push(
      `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // Map site id → index for fast lookup
  const siteMap = new Map(sites.map((s) => [s.id, s]));

  // Aggregate: { date -> { siteId -> revenue } }
  const byDateSite: Record<string, Record<string, number>> = {};
  for (const label of dateLabels) byDateSite[label] = {};

  for (const order of orders) {
    const d = new Date(order.created_at);
    const label = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!byDateSite[label]) continue;
    byDateSite[label][order.site_id] = (byDateSite[label][order.site_id] ?? 0) + (order.total ?? 0);
  }

  // Build series per site
  const activeSiteIds = siteId
    ? [siteId]
    : [...new Set(orders.map((o) => o.site_id))];

  const series = activeSiteIds.map((sid) => {
    const site = siteMap.get(sid);
    return {
      siteId: sid,
      name: site?.name ?? sid,
      color: site?.color_hex ?? "#1B6EF3",
      data: dateLabels.map((label) => byDateSite[label][sid] ?? 0),
    };
  });

  // Total line
  const totals = dateLabels.map((label) =>
    Object.values(byDateSite[label]).reduce((s, v) => s + v, 0)
  );

  return NextResponse.json({ labels: dateLabels, series, totals });
}
