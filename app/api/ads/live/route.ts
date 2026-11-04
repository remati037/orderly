import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { loadLivePage } from "@/lib/ads/live-data";

// Everything on /reklame. No tokens or margins in here: the whole team sees it.
export async function GET() {
  const { error: authError } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  try {
    return NextResponse.json(await loadLivePage(adminClient()));
  } catch (e) {
    console.error("[ads/live]", e);
    return NextResponse.json({ error: "Failed to load ads data" }, { status: 500 });
  }
}
