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
