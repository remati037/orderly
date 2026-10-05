import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { PUBLIC_SITE_COLUMNS, secretFlags } from "@/lib/utils/site-columns";

export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();

  const { data: sites, error } = await supabase
    .from("sites")
    .select(`${PUBLIC_SITE_COLUMNS}, consumer_key, consumer_secret, thinkific_api_key`)
    .order("created_at");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const siteIds = (sites ?? []).map((s) => s.id);

  // Latest log per site — one tiny query each instead of pulling the whole
  // sync_log table (which also got cut off at 1000 rows).
  const latestLogs = await Promise.all(
    siteIds.map((id) =>
      supabase
        .from("sync_log")
        .select("site_id, created_at, status")
        .eq("site_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    )
  );

  const latestSync: Record<string, { created_at: string; status: string }> = {};
  for (const { data: log } of latestLogs) {
    if (log) latestSync[log.site_id] = { created_at: log.created_at, status: log.status };
  }

  return NextResponse.json(
    (sites ?? []).map(({ consumer_key, consumer_secret, thinkific_api_key, ...site }) => ({
      ...site,
      ...secretFlags({ consumer_key, consumer_secret, thinkific_api_key }),
      last_sync: latestSync[site.id] ?? null,
    }))
  );
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const body = await request.json();
  const {
    name,
    platform,
    url,
    subdomain,
    consumer_key,
    consumer_secret,
    thinkific_api_key,
    color_hex,
    project_type,
    is_active,
    stripe_filter,
  } = body;

  if (!name || !platform)
    return NextResponse.json(
      { error: "Name and platform are required" },
      { status: 400 }
    );

  const supabase = adminClient();

  const { data: site, error } = await supabase
    .from("sites")
    .insert({
      name,
      platform,
      url: url || null,
      subdomain: subdomain || null,
      consumer_key: consumer_key || null,
      consumer_secret: consumer_secret || null,
      thinkific_api_key: thinkific_api_key || null,
      color_hex: color_hex || "#16A34A",
      project_type: project_type || "standard",
      stripe_filter: stripe_filter?.trim() || null,
      is_active: is_active ?? true,
    })
    .select(PUBLIC_SITE_COLUMNS)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(site, { status: 201 });
}
