import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// An in-process Postgres with every migration applied, so SQL (triggers,
// functions, backfills) is tested the way production runs it. Supabase-only
// pieces — the API roles and auth.users — are stubbed first.
const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);
  -- Same source as Supabase: the JWT subject of the current request.
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::UUID $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`;

export function migrationFiles(upTo = Infinity): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f) && Number(f.split("_")[0]) <= upTo)
    .sort();
}

export async function migratedDb(upTo = Infinity): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of migrationFiles(upTo)) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    } catch (err) {
      throw new Error(`${f}: ${(err as Error).message}`);
    }
  }
  return db;
}

export function readMigration(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}
