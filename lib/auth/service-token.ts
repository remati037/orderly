import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

// Machine callers of the Meta live routes (pg_cron, Claude's scheduled task)
// send `Authorization: Bearer <token>`. Only its SHA-256 hex is stored, in
// settings.meta_live_token_sha256, so it can be set without touching Vercel;
// every signed-in member can read the settings table. Routes using this must be
// public in proxy.ts.
export async function hasMetaLiveToken(supabase: SupabaseClient, request: NextRequest): Promise<boolean> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "meta_live_token_sha256")
    .maybeSingle();
  if (typeof data?.value !== "string") return false;

  const expected = Buffer.from(data.value, "hex");
  const given = sha256((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Support Hub (the helpdesk) reads customers through /api/support/* with
// `Authorization: Bearer <token>`. Same scheme: only the SHA-256 hex lives in
// settings.support_hub_token_sha256. The settings row's org_id is the org the
// token may read, so every query is fenced to it. Returns that org, or null.
export async function supportHubTokenOrg(supabase: SupabaseClient, request: NextRequest): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length <= 7) return null;

  const { data } = await supabase
    .from("settings")
    .select("value, org_id")
    .eq("key", "support_hub_token_sha256")
    .maybeSingle();
  if (typeof data?.value !== "string" || typeof data?.org_id !== "string") return null;

  const expected = Buffer.from(data.value, "hex");
  const given = sha256(header.slice(7));
  return given.length === expected.length && timingSafeEqual(given, expected) ? data.org_id : null;
}
