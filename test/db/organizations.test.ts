import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { migratedDb } from "./pglite";

const DEFAULT_ORG = "00000000-0000-0000-0000-000000000001";
let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
}, 60_000);

// Runs `sql` as a signed-in browser user (role authenticated + JWT subject).
async function asUser<T>(userId: string | null, sql: string): Promise<T[]> {
  await db.exec("BEGIN");
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await db.exec("SET LOCAL ROLE authenticated");
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("ROLLBACK");
  }
}

describe("organizations", () => {
  it("existing code keeps inserting without knowing about orgs", async () => {
    const { rows } = await db.query<{ org_id: string }>(
      "INSERT INTO sites (name, platform) VALUES ('S', 'woocommerce') RETURNING org_id"
    );
    expect(rows[0].org_id).toBe(DEFAULT_ORG);
  });

  it("every public table has org_id", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT t.table_name FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name <> 'organizations'
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                           WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'org_id')`
    );
    expect(rows).toEqual([]);
  });

  it("a member sees their org's rows; strangers and other orgs see nothing", async () => {
    const other = (await db.query<{ id: string }>(
      "INSERT INTO organizations (name) VALUES ('Druga firma') RETURNING id"
    )).rows[0].id;
    await db.query("INSERT INTO sites (name, platform, org_id) VALUES ('Tuđi', 'woocommerce', $1)", [other]);
    const user = (await db.query<{ id: string }>("INSERT INTO auth.users (email) VALUES ('a@x.rs') RETURNING id")).rows[0].id;
    await db.query(
      "INSERT INTO team_members (email, role, auth_user_id, is_active) VALUES ('a@x.rs', 'owner', $1, true)", [user]);

    expect(await asUser<{ name: string }>(user, "SELECT name FROM sites ORDER BY name")).toEqual([{ name: "S" }]);
    expect(await asUser(null, "SELECT name FROM sites")).toEqual([]);
  });
});
