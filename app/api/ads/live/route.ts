import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadLivePage } from "@/lib/ads/live-data";
import { PERIODS, type PeriodKey } from "@/lib/ads/report";

// Everything on /reklame. No tokens or margins in here: the whole team sees it.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const asked = request.nextUrl.searchParams.get("period") as PeriodKey | null;
  const period = asked && PERIODS.includes(asked) ? asked : "7d";

  try {
    return NextResponse.json(await loadLivePage(adminClient(), period));
  } catch (e) {
    console.error("[ads/live]", e);
    return NextResponse.json({ error: "Failed to load ads data" }, { status: 500 });
  }
}
