import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { syncThinkificSite } from "@/lib/sync/sync-thinkific-site";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const supabase = adminClient();

  const { data: site, error } = await supabase
    .from("sites")
    .select("id, name, subdomain, thinkific_api_key, default_margin_percent, platform")
    .eq("id", siteId)
    .single();

  if (error || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (site.platform !== "thinkific") {
    return NextResponse.json({ error: "Not a Thinkific site" }, { status: 400 });
  }

  const synced = await syncThinkificSite(supabase, site, "manual");

  return NextResponse.json({ synced, site: site.name });
}
