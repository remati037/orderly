import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetch-all";

// Serves `total` rows in pages capped at 1000, like PostgREST's max_rows.
function source(total: number, failAt?: number) {
  const ranges: [number, number][] = [];
  const build = () => ({
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      if (failAt !== undefined && from >= failAt) return { data: null, error: new Error("boom") };
      const end = Math.min(to + 1, total, from + 1000);
      return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null };
    },
  });
  return { build, ranges };
}

describe("fetchAll", () => {
  it("pages past the 1000-row cap", async () => {
    const { build, ranges } = source(2500);
    const { data, error } = await fetchAll(build);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(new Set(data).size).toBe(2500);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after an exactly-full last page", async () => {
    const { build, ranges } = source(1000);
    expect((await fetchAll(build)).data).toHaveLength(1000);
    expect(ranges).toHaveLength(2);
  });

  it("returns the error and the rows read so far", async () => {
    const { data, error } = await fetchAll(source(3000, 1000).build);
    expect(error).toBeInstanceOf(Error);
    expect(data).toHaveLength(1000);
  });
});
