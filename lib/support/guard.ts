import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supportHubTokenOrg } from "@/lib/auth/service-token";
import { takeRateLimit } from "./rate-limit";

export const NO_STORE = { "Cache-Control": "no-store" };

// Shared by /api/support/*: token → org (401), then the per-token rate limit (429).
// Returns the org the caller may read, or the error response to send.
export async function guardSupportRequest(
  supabase: SupabaseClient,
  request: NextRequest
): Promise<{ orgId: string } | { response: NextResponse }> {
  const orgId = await supportHubTokenOrg(supabase, request);
  if (!orgId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE }) };
  }

  // Keyed on the token's hash, never the token itself.
  const key = createHash("sha256").update(request.headers.get("authorization") ?? "").digest("hex");
  const rate = takeRateLimit(key);
  if (!rate.ok) {
    return {
      response: NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(rate.retryAfter) } }
      ),
    };
  }
  return { orgId };
}

/** For logs: the email's domain only, never the address. */
export function emailDomain(email: string): string {
  return email.split("@").pop()?.toLowerCase() || "?";
}
