import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { guardSupportRequest, NO_STORE } from "@/lib/support/guard";

// Read-only list of the org's sites for Support Hub, which maps them to its
// projects. Public in proxy.ts; authenticated by the Support Hub token.
//   GET /api/support/sites → { sites: [{ id, name, url, platform }] }
export async function GET(request: NextRequest) {
  const supabase = adminClient();
  const guard = await guardSupportRequest(supabase, request);
  if ("response" in guard) return guard.response;

  const { data, error } = await supabase
    .from("sites")
    .select("id, name, url, platform")
    .eq("org_id", guard.orgId)
    .order("name");
  if (error) {
    console.error("[support/sites] query failed:", error.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE });
  }

  const sites = (data ?? []).map((s) => ({
    id: s.id as string,
    name: (s.name as string) ?? "",
    url: (s.url as string | null) ?? "",
    platform: (s.platform as string) ?? "",
  }));
  return NextResponse.json({ sites }, { headers: NO_STORE });
}
