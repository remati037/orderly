import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { sweepCircleAccess } from "@/lib/circle/access";

export const maxDuration = 300;

// Owner-only: run the Circle access sweep now (same code as the daily cron)
// over the last `days` days (1–30, default 7), e.g. right after adding a rule
// in settings.circle_access. Returns the counts and the grants of the window,
// so the result can be checked without database access.
export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));
  const supabase = adminClient();
  const stats = await sweepCircleAccess(supabase, days);

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: grants } = await supabase
    .from("circle_grants")
    .select("email, access_group_id, status, attempts, last_error, updated_at")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(500);

  return NextResponse.json({ days, ...stats, grants: grants ?? [] });
}
