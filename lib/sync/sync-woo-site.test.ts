import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWooTrashedIds } from "./sync-woo-site";

const site = { id: "s", name: "S", url: "https://shop.rs/", consumer_key: "ck", consumer_secret: "cs", default_margin_percent: 100 };

afterEach(() => vi.unstubAllGlobals());

describe("fetchWooTrashedIds", () => {
  it("asks for trashed orders changed since the cutoff and pages through them", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      const body = page === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) : [{ id: 7094 }];
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const ids = await fetchWooTrashedIds(site, "2026-10-13T00:00:00.000Z");
    expect(ids).toHaveLength(101);
    expect(ids.at(-1)).toBe("7094");
    expect(urls[0]).toBe(
      "https://shop.rs/wp-json/wc/v3/orders?status=trash&per_page=100&page=1&modified_after=2026-10-13T00%3A00%3A00.000Z"
    );
  });
});
