// Runs SQL against the Supabase project through the Management API, so
// migrations don't need the database password or a manual SQL Editor paste.
//
//   npm run db:status               list applied / pending migrations
//   npm run db:migrate              apply pending migrations in order
//   npm run db:baseline -- 014      mark everything up to 014 as applied without running it
//   npm run db:query -- "select 1"  run an ad-hoc query and print the rows
//
// Needs SUPABASE_ACCESS_TOKEN (personal access token, sbp_…) and
// NEXT_PUBLIC_SUPABASE_URL in .env.local. Applied migrations are tracked in
// supabase_migrations.schema_migrations — the same table the Supabase CLI uses.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !projectRef) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}

const quote = (s) => `'${s.replaceAll("'", "''")}'`;

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
      return { file, version, name };
    });
}

async function appliedVersions() {
  await query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version    text PRIMARY KEY,
      statements text[],
      name       text
    );
  `);
  const rows = await query("SELECT version FROM supabase_migrations.schema_migrations");
  return new Set(rows.map((r) => r.version));
}

async function record(m) {
  await query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name)
     VALUES (${quote(m.version)}, ${quote(m.name)}) ON CONFLICT (version) DO NOTHING`
  );
}

const [command, arg] = process.argv.slice(2);

switch (command) {
  case "status": {
    const applied = await appliedVersions();
    for (const m of migrationFiles())
      console.log(`${applied.has(m.version) ? "applied" : "PENDING"}  ${m.file}`);
    break;
  }

  case "migrate": {
    const applied = await appliedVersions();
    const pending = migrationFiles().filter((m) => !applied.has(m.version));
    if (!pending.length) console.log("No pending migrations.");
    for (const m of pending) {
      process.stdout.write(`Applying ${m.file} … `);
      try {
        await query(readFileSync(join(MIGRATIONS_DIR, m.file), "utf8"));
      } catch (err) {
        console.log("FAILED");
        console.error(err.message);
        process.exit(1);
      }
      await record(m);
      console.log("ok");
    }
    break;
  }

  case "baseline": {
    if (!arg) {
      console.error("Usage: npm run db:baseline -- <last-applied-version>");
      process.exit(1);
    }
    const applied = await appliedVersions();
    for (const m of migrationFiles()) {
      if (Number(m.version) > Number(arg) || applied.has(m.version)) continue;
      await record(m);
      console.log(`marked applied  ${m.file}`);
    }
    break;
  }

  case "query": {
    if (!arg) {
      console.error('Usage: npm run db:query -- "<sql>"');
      process.exit(1);
    }
    console.table(await query(arg));
    break;
  }

  default:
    console.error("Commands: status | migrate | baseline <version> | query <sql>");
    process.exit(1);
}
