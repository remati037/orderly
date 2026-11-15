import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { guardSupportRequest, NO_STORE } from "@/lib/support/guard";

// Read-only LTV summary for Support Hub's contact list (LTV column + filters).
//   POST /api/support/customers/summary
//   { "emails": string[] (1–500), "site_ids": uuid[] (1–20) }
//   → { customers: [{ email, site_id, total_spent, orders_count, last_order_at, currency }] }
// One row per (email, site) with at least one paid order the customer kept;
// same rules as /api/support/customer. One call counts as one request against
// the rate limit. Only SELECTs: support_customers_summary (migration 038).
// Public in proxy.ts; authenticated by the Support Hub token.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EMAILS = 500;
const MAX_SITES = 20;

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

interface SummaryRow {
  email: string;
  site_id: string;
  total_spent: number | string;
  orders_count: number;
  last_order_at: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = adminClient();
  const guard = await guardSupportRequest(supabase, request);
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  const emailsIn: unknown = body?.emails;
  const sitesIn: unknown = body?.site_ids;

  if (!Array.isArray(emailsIn) || emailsIn.length === 0) return badRequest("emails is required");
  if (emailsIn.length > MAX_EMAILS) return badRequest(`at most ${MAX_EMAILS} emails`);
  if (!emailsIn.every((e) => typeof e === "string" && e.length <= 320)) return badRequest("emails are not valid");
  const emails = [...new Set(emailsIn.map((e: string) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];

  if (!Array.isArray(sitesIn) || sitesIn.length === 0) return badRequest("site_ids is required");
  if (sitesIn.length > MAX_SITES) return badRequest(`at most ${MAX_SITES} site_ids`);
  if (!sitesIn.every((s) => typeof s === "string" && UUID.test(s))) return badRequest("site_ids are not valid");
  const siteIds = [...new Set(sitesIn as string[])];

  if (emails.length === 0) return NextResponse.json({ customers: [] }, { headers: NO_STORE });

  const [summary, fx] = await Promise.all([
    supabase.rpc("support_customers_summary", { p_org: guard.orgId, p_emails: emails, p_site_ids: siteIds }),
    loadFxSettings(supabase),
  ]);
  if (summary.error) {
    console.error(`[support/customers/summary] lookup failed (${emails.length} emails):`, summary.error.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: NO_STORE });
  }

  const currency = fx.baseCurrency.toUpperCase();
  const customers = ((summary.data ?? []) as SummaryRow[]).map((r) => ({
    email: r.email,
    site_id: r.site_id,
    total_spent: Math.round(Number(r.total_spent) * 100) / 100,
    orders_count: Number(r.orders_count),
    last_order_at: r.last_order_at,
    currency,
  }));
  return NextResponse.json({ customers }, { headers: NO_STORE });
}
