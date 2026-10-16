import { describe, expect, it } from "vitest";
import { migratedDb } from "./pglite";

describe("migrations", () => {
  it("apply cleanly from scratch", async () => {
    const db = await migratedDb();
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'"
    );
    expect(rows[0].n).toBeGreaterThan(10);
  }, 60_000);
});
