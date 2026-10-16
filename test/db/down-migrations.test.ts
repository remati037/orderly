import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migratedDb, migrationFiles, readMigration } from "./pglite";

// Every down file must undo its migration exactly, and the migration must then
// apply again cleanly — that is what makes a production rollback safe to try.
const DOWN_DIR = join(__dirname, "..", "..", "supabase", "migrations", "down");
const downFiles = readdirSync(DOWN_DIR).filter((f) => f.endsWith(".down.sql")).sort();

const SCHEMA_SNAPSHOT = `
  SELECT string_agg(x, E'\\n' ORDER BY x) AS s FROM (
    SELECT 'col ' || table_name || '.' || column_name || ' ' || data_type AS x
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL
    SELECT 'fn ' || p.oid::regprocedure::text FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'trg ' || tgrelid::regclass::text || '.' || tgname FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL
    SELECT 'idx ' || indexname FROM pg_indexes WHERE schemaname = 'public'
    UNION ALL
    SELECT 'con ' || conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace
  ) t`;

describe.each(downFiles)("%s", (downFile) => {
  const version = Number(downFile.split("_")[0]);
  const upFile = migrationFiles(version).at(-1)!;

  it("restores the schema from before the migration, and the migration re-applies", async () => {
    const before = await migratedDb(version - 1);
    const expected = (await before.query<{ s: string }>(SCHEMA_SNAPSHOT)).rows[0].s;

    // Only valid while it is the latest migration that touches these objects;
    // later migrations are rolled back first in production too.
    const db = await migratedDb(version);
    await db.exec(readFileSync(join(DOWN_DIR, downFile), "utf8"));
    expect((await db.query<{ s: string }>(SCHEMA_SNAPSHOT)).rows[0].s).toBe(expected);

    await db.exec(readMigration(upFile));
  }, 60_000);
});
