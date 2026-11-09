import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadAdLibrary } from "@/lib/ads/live-data";
import { LIBRARY_PERIODS, type LibraryPeriod } from "@/lib/ads/library";

// Every creative that spent lately, for "Svi oglasi". The whole team sees it.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const asked = request.nextUrl.searchParams.get("period") as LibraryPeriod | null;
  const period = asked && LIBRARY_PERIODS.includes(asked) ? asked : "7d";

  try {
    return NextResponse.json(await loadAdLibrary(adminClient(), period));
  } catch (e) {
    console.error("[ads/library]", e);
    return NextResponse.json({ error: "Failed to load ads" }, { status: 500 });
  }
}
