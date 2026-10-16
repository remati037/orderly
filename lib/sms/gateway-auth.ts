import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";

// The SMS gateway (a Mac with a USB modem) can't hold a Supabase session, so its
// routes are public in proxy.ts and authenticate with `Authorization: Bearer <token>`.
// Same scheme as /api/menubar: the token is SMS_GATEWAY_TOKEN, or its SHA-256 hex
// in settings.sms_gateway_token_sha256 — only the hash is stored because every
// signed-in member can read the settings table.
const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function tokenMatches(authorization: string | null, expected: Buffer): boolean {
  const given = sha256((authorization ?? "").replace(/^Bearer /, ""));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function expectedTokenHash(supabase: SupabaseClient): Promise<Buffer | null> {
  if (process.env.SMS_GATEWAY_TOKEN) return sha256(process.env.SMS_GATEWAY_TOKEN);
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "sms_gateway_token_sha256")
    .maybeSingle();
  return typeof data?.value === "string" ? Buffer.from(data.value, "hex") : null;
}

/** "ok" | "unconfigured" | "unauthorized" */
export async function checkGateway(
  request: NextRequest,
  supabase: SupabaseClient
): Promise<"ok" | "unconfigured" | "unauthorized"> {
  const expected = await expectedTokenHash(supabase);
  if (!expected) return "unconfigured";
  return tokenMatches(request.headers.get("authorization"), expected) ? "ok" : "unauthorized";
}
