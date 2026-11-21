import { describe, it, expect, vi } from "vitest";
import { matchAccessGroups, matchCircleTargets, isPaidStatus, grantCircleAccess, parseCircleConfig } from "./access";

const order = { line_items: [{ product_id: 11 }, { product_id: 22 }] };

describe("matchAccessGroups", () => {
  it("matches by product id and de-duplicates groups", () => {
    const rules = [
      { woo_product_id: 22, access_group_id: 5 },
      { woo_product_id: 11, access_group_id: 5 },
      { woo_product_id: 99, access_group_id: 7 },
    ];
    expect(matchAccessGroups(order, "s1", rules)).toEqual([5]);
  });
  it("respects site_id scoping", () => {
    expect(matchAccessGroups(order, "s1", [{ site_id: "s2", woo_product_id: 11, access_group_id: 5 }])).toEqual([]);
  });
  it("handles orders without line items", () => {
    expect(matchAccessGroups(null, "s1", [{ woo_product_id: 1, access_group_id: 2 }])).toEqual([]);
  });
});

describe("isPaidStatus / parseCircleConfig", () => {
  it("only processing and completed are paid", () => {
    expect(isPaidStatus("processing")).toBe(true);
    expect(isPaidStatus("completed")).toBe(true);
    expect(isPaidStatus("on-hold")).toBe(false);
    expect(isPaidStatus(null)).toBe(false);
  });
  it("defaults to disabled", () => {
    expect(parseCircleConfig(null)).toEqual({ enabled: false, enabled_from: null, rules: [] });
  });
});

function res(status: number, body = "{}") {
  return new Response(body, { status });
}

describe("grantCircleAccess", () => {
  const args = { email: " A@B.com ", name: "Ana", accessGroupId: 132017 };

  it("existing member: only adds to the group", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(200));
    await grantCircleAccess("t", args, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toContain("/access_groups/132017/community_members");
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ email: "a@b.com" });
  });

  it("unknown member: creates, then adds", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(201)).mockResolvedValueOnce(res(200));
    await grantCircleAccess("t", args, f as unknown as typeof fetch);
    expect(f.mock.calls[1][1].method).toBe("POST");
    expect(f.mock.calls[1][0]).toMatch(/\/community_members$/);
  });

  it("throws when adding to the group fails", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(500, "boom"));
    await expect(grantCircleAccess("t", args, f as unknown as typeof fetch)).rejects.toThrow(/500/);
  });

  it("tolerates already-in-group", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(422, "already a member"));
    await expect(grantCircleAccess("t", args, f as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});

describe("enabled_from", () => {
  it("is parsed from settings", () => {
    expect(parseCircleConfig({ enabled: true, enabled_from: "2026-10-20T12:00:00Z", rules: [] }).enabled_from).toBe(
      "2026-10-20T12:00:00Z"
    );
  });
});

describe("matchCircleTargets (whole-site and space group rules)", () => {
  it("whole-site rule matches any order of that site, space groups are negative", () => {
    const rules = [
      { site_id: "ic", access_group_id: 124997 },
      { site_id: "ic", space_group_id: 1202906 },
    ];
    expect(matchCircleTargets(null, "ic", rules)).toEqual([124997, -1202906]);
    expect(matchCircleTargets(null, "other", rules)).toEqual([]);
  });
  it("a rule without product and without site never matches", () => {
    expect(matchCircleTargets(null, "s1", [{ access_group_id: 5 }])).toEqual([]);
  });
  it("matchAccessGroups keeps only access groups", () => {
    expect(matchAccessGroups(null, "ic", [{ site_id: "ic", access_group_id: 5, space_group_id: 9 }])).toEqual([5]);
  });
});

describe("grantCircleAccess to a space group", () => {
  it("posts to space_group_members", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(200));
    await grantCircleAccess("t", { email: "a@b.com", name: "A", accessGroupId: -1202906 }, f as unknown as typeof fetch);
    expect(f.mock.calls[1][0]).toMatch(/\/space_group_members$/);
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ email: "a@b.com", space_group_id: 1202906 });
  });
});

describe("single space rules", () => {
  it("encode space_id below -1e9 and post to space_members", async () => {
    expect(matchCircleTargets({ line_items: [{ product_id: 44833 }] }, "v", [
      { site_id: "v", woo_product_id: 44833, space_id: 2797317 },
    ])).toEqual([-1_002_797_317]);
    const f = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(200));
    await grantCircleAccess("t", { email: "a@b.com", name: "A", accessGroupId: -1_002_797_317 }, f as unknown as typeof fetch);
    expect(f.mock.calls[1][0]).toMatch(/\/space_members$/);
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ email: "a@b.com", space_id: 2797317 });
  });
});

describe("space member already in the space", () => {
  it("treats Circle's 422 as success when the member is already there", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200))
      .mockResolvedValueOnce(res(422, '{"message":"User not added to space."}'))
      .mockResolvedValueOnce(res(200));
    await grantCircleAccess("t", { email: "a@b.com", name: "A", accessGroupId: -1_002_797_317 }, f as unknown as typeof fetch);
    expect(f.mock.calls[2][0]).toMatch(/\/space_member\?space_id=2797317&email=a%40b\.com$/);
  });
  it("still fails when the member is not in the space", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200))
      .mockResolvedValueOnce(res(422, '{"message":"User not added to space."}'))
      .mockResolvedValueOnce(res(404));
    await expect(
      grantCircleAccess("t", { email: "a@b.com", name: "A", accessGroupId: -1_002_797_317 }, f as unknown as typeof fetch)
    ).rejects.toThrow(/422/);
  });
});
