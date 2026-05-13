import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const supabase = adminClient();

  let query = supabase.from("orders").select("status");

  if (siteId) query = query.eq("site_id", siteId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  const breakdown = Object.entries(counts).map(([status, count]) => ({
    status,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  return NextResponse.json({ breakdown, total });
}
