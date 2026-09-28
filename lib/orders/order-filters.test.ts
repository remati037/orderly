import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOrderFilters, parseOrderFilters } from "./order-filters";

// Records the PostgREST calls made on it.
function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const q = new Proxy({} as Record<string, unknown>, {
    get: (_t, method: string) => (...args: unknown[]) => { calls.push([method, ...args]); return q; },
  });
  return { q: q as never, calls };
}

afterEach(() => vi.useRealTimers());

describe("parseOrderFilters", () => {
  it("reads the /porudzbine URL params", () => {
    const f = parseOrderFilters(new URLSearchParams({ sites: "a,b", status: "failed", platform: "stripe", q: "  ana  " }));
    expect(f).toMatchObject({ siteIds: ["a", "b"], status: "failed", platform: "stripe", q: "ana" });
  });

  it("turns presets into Belgrade-time ranges", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T22:30:00Z"));
    expect(parseOrderFilters({ date_preset: "today" })).toMatchObject({
      from: "2026-09-28T22:00:00.000Z",
      to: "2026-09-29T22:00:00.000Z",
    });
  });

  it("custom dates include the whole 'to' day", () => {
    const f = parseOrderFilters({ date_from: "2026-09-01", date_to: "2026-09-02" });
    expect(f).toMatchObject({ from: "2026-08-31T22:00:00.000Z", to: "2026-09-02T22:00:00.000Z" });
  });
});

describe("applyOrderFilters", () => {
  it("applies every filter", () => {
    const { q, calls } = recorder();
    applyOrderFilters(q, parseOrderFilters({ sites: "s1", platform: "woocommerce", status: "completed", product_type: "digital", date_from: "2026-09-01" }));
    expect(calls).toEqual([
      ["in", "site_id", ["s1"]],
      ["eq", "source", "woocommerce"],
      ["eq", "status", "completed"],
      ["eq", "product_type", "digital"],
      ["gte", "created_at", "2026-08-31T22:00:00.000Z"],
    ]);
  });

  it("searches name, email and order number; '#' is ignored for the number", () => {
    const { q, calls } = recorder();
    applyOrderFilters(q, parseOrderFilters({ q: "#1234" }));
    expect(calls).toEqual([["or", "customer_name.ilike.*#1234*,customer_email.ilike.*#1234*,woo_order_id.eq.1234"]]);
  });

  it("strips PostgREST syntax characters from the search term", () => {
    const { q, calls } = recorder();
    applyOrderFilters(q, parseOrderFilters({ q: "a,b),status.eq.x" }));
    expect(String(calls[0][1])).not.toMatch(/[()]/);
    expect(String(calls[0][1]).split(",")).toHaveLength(3);

    const empty = recorder();
    applyOrderFilters(empty.q, parseOrderFilters({ q: "(),*" }));
    expect(empty.calls).toEqual([]);
  });
});
