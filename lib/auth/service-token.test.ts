import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasMetaLiveToken } from "./service-token";

const clientWith = (value: unknown) =>
  ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: value === undefined ? null : { value } }) }) }) }),
  }) as unknown as SupabaseClient;

const request = (auth?: string) =>
  new NextRequest("http://localhost/api/ads/live-summary", auth ? { headers: { authorization: auth } } : undefined);

const hash = createHash("sha256").update("tajna").digest("hex");

describe("hasMetaLiveToken", () => {
  it("accepts the token whose hash is stored", async () => {
    expect(await hasMetaLiveToken(clientWith(hash), request("Bearer tajna"))).toBe(true);
  });
  it("rejects a wrong or missing token", async () => {
    expect(await hasMetaLiveToken(clientWith(hash), request("Bearer druga"))).toBe(false);
    expect(await hasMetaLiveToken(clientWith(hash), request())).toBe(false);
  });
  it("rejects everything until a hash is configured", async () => {
    expect(await hasMetaLiveToken(clientWith(undefined), request("Bearer tajna"))).toBe(false);
  });
});
