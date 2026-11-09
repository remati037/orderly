import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadAdLibrary } from "@/lib/ads/live-data";
import { LIBRARY_DAYS, type LibraryDays } from "@/lib/ads/library";

// Every creative that spent lately, for "Svi oglasi". The whole team sees it.
export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days = (LIBRARY_DAYS as readonly number[]).includes(asked) ? (asked as LibraryDays) : 7;

  try {
    return NextResponse.json(await loadAdLibrary(adminClient(), days));
  } catch (e) {
    console.error("[ads/library]", e);
    return NextResponse.json({ error: "Failed to load ads" }, { status: 500 });
  }
}
