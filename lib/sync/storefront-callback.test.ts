import { describe, expect, it, vi } from "vitest";
import { callbackUrls, notifyStorefronts, signBody } from "./storefront-callback";
import { verifyHmacSignature } from "./hmac-signature";

const SITE = "site-ou";
const URLS = JSON.stringify({ [SITE]: "https://shop.test/api/potvrda-uplate" });
const secret = "manual_secret";
const now = () => 1_760_000_000_000;

function okFetch() {
  return vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
}

describe("notifyStorefronts", () => {
  it("posts a signed body to the site's callback url", async () => {
    const f = okFetch();
    const r = await notifyStorefronts([{ site_id: SITE, woo_order_id: "4000003" }], "completed",
      { urls: URLS, secret, fetchFn: f as unknown as typeof fetch, now });
    expect(r).toEqual([{ order: "4000003", ok: true }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://shop.test/api/potvrda-uplate");
    expect(JSON.parse(init.body as string)).toEqual({ id: 4000003, vreme: 1_760_000_000, status: "completed" });
    const sig = (init.headers as Record<string, string>)["X-Potpis"];
    expect(verifyHmacSignature(init.body as string, sig, secret, "base64")).toBe(true);
  });

  it("skips sites without a callback url and orders without a number", async () => {
    const f = okFetch();
    const r = await notifyStorefronts(
      [{ site_id: "woo-shop", woo_order_id: "123" }, { site_id: SITE, woo_order_id: null }],
      "cancelled", { urls: URLS, secret, fetchFn: f as unknown as typeof fetch, now });
    expect(r).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("reports a storefront error instead of throwing", async () => {
    const f = vi.fn(async () => new Response('{"greska":"potpis ne važi"}', { status: 401 }));
    const r = await notifyStorefronts([{ site_id: SITE, woo_order_id: "4000002" }], "cancelled",
      { urls: URLS, secret, fetchFn: f as unknown as typeof fetch, now });
    expect(r[0].ok).toBe(false);
    expect(r[0].error).toContain("401");
  });

  it("reports a network failure instead of throwing", async () => {
    const f = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const r = await notifyStorefronts([{ site_id: SITE, woo_order_id: "4000002" }], "completed",
      { urls: URLS, secret, fetchFn: f as unknown as typeof fetch, now });
    expect(r).toEqual([{ order: "4000002", ok: false, error: "Error: ECONNRESET" }]);
  });

  it("does not call without a secret, and says why", async () => {
    const f = okFetch();
    const r = await notifyStorefronts([{ site_id: SITE, woo_order_id: "4000002" }], "completed",
      { urls: URLS, secret: "", fetchFn: f as unknown as typeof fetch, now });
    expect(f).not.toHaveBeenCalled();
    expect(r[0]).toMatchObject({ ok: false, error: "MANUAL_WEBHOOK_SECRET is not set" });
  });
});

describe("callbackUrls", () => {
  it("returns an empty map for missing or broken config", () => {
    expect(callbackUrls(undefined)).toEqual({});
    expect(callbackUrls("not json")).toEqual({});
  });
  it("signBody matches the storefront's base64 HMAC", () => {
    expect(signBody("{}", "k")).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
