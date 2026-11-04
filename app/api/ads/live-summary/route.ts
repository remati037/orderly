import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { hasMetaLiveToken } from "@/lib/auth/service-token";
import { loadLiveSummary } from "@/lib/ads/live-data";

// What Claude's scheduled run reads before writing recommendations.
export async function GET(request: NextRequest) {
  const supabase = adminClient();
  if (!(await hasMetaLiveToken(supabase, request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await loadLiveSummary(supabase));
  } catch (e) {
    console.error("[ads/live-summary]", e);
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
