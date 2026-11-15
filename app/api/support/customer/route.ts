import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { parseCircleConfig } from "@/lib/circle/access";
import { buildCustomerResponse, type LookupResult } from "@/lib/support/customer";
import { emailDomain, guardSupportRequest, NO_STORE } from "@/lib/support/guard";

// Read-only customer card for Support Hub (helpdesk).
//   GET /api/support/customer?email=<email>&site_ids=<id,id>
// Only SELECTs: one call to support_customer_lookup (migration 037), which is
// fenced to the token's org and the requested sites, plus fx and Circle settings.
// Public in proxy.ts; authenticated by the Support Hub token.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SITES = 50;

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

export async function GET(request: NextRequest) {
  const supabase = adminClient();
  const guard = await guardSupportRequest(supabase, request);
  if ("response" in guard) return guard.response;

  const params = request.nextUrl.searchParams;
  const email = (params.get("email") ?? "").trim();
  if (!email) return badRequest("email is required");
  if (!email.includes("@") || email.length > 320) return badRequest("email is not valid");

  const siteIds = [...new Set((params.get("site_ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (siteIds.length === 0) return badRequest("site_ids is required");
  if (siteIds.length > MAX_SITES || !siteIds.every((id) => UUID.test(id))) return badRequest("site_ids are not valid");

  const [lookup, fx, circle] = await Promise.all([
    supabase.rpc("support_customer_lookup", { p_org: guard.orgId, p_email: email, p_site_ids: siteIds }),
    loadFxSettings(supabase),
    supabase.from("settings").select("value").eq("key", "circle_access").maybeSingle(),
  ]);
  if (lookup.error || !lookup.data) {
    console.error(`[support/customer] lookup failed (@${emailDomain(email)}):`, lookup.error?.message ?? "no data");
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE });
  }

  const body = buildCustomerResponse(lookup.data as LookupResult, {
    origin: request.nextUrl.origin,
    baseCurrency: fx.baseCurrency,
    rates: fx.rates,
    circle: parseCircleConfig(circle.data?.value),
  });
  return NextResponse.json(body, { headers: NO_STORE });
}
