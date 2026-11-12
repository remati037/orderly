// npm run demo — Orderly on a local database full of made-up data, for
// screen recordings. Nothing connects to the real Supabase project:
//
//   1. a local Postgres cluster in .demo/pg (port 54329), rebuilt from the
//      migrations and filled by seed.mjs on every start, so "today" is today,
//   2. PostgREST on it (port 54330) behind a small gateway (port 54331) that
//      looks like Supabase to supabase-js,
//   3. next dev on http://localhost:3100 with every real secret blanked out.
//
// Needs Homebrew postgres and postgrest (brew install postgresql@16 postgrest).
// Ctrl+C stops everything.

import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { DEMO_AUTH_USER_ID } from "./ids.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const DIR = join(ROOT, ".demo");
const PGDATA = join(DIR, "pg");
const PG_PORT = 54329;
const REST_PORT = 54330;
const GATEWAY_PORT = 54331;
const APP_PORT = Number(process.env.DEMO_PORT ?? 3100);
const DB = "orderly_demo";
const JWT_SECRET = "orderly-demo-local-jwt-secret-not-a-real-key-000000";
const LOCALE = { LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" };

const children = [];
function log(msg) { console.log(`\x1b[36m[demo]\x1b[0m ${msg}`); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...LOCALE }, ...opts });
  if (r.error) throw r.error;
  return r;
}
function must(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
  return r.stdout;
}
const psql = (args, opts) =>
  must("psql", ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", ...args], opts);

function jwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iat: 1700000000, exp: 4100000000, ...payload })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}

// ── 1. Postgres ──────────────────────────────────────────────────────────────
mkdirSync(DIR, { recursive: true });
if (!existsSync(PGDATA)) {
  log("Pravim lokalnu Postgres bazu u .demo/pg …");
  must("initdb", ["-D", PGDATA, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=en_US.UTF-8"]);
}
if (run("pg_ctl", ["-D", PGDATA, "status"]).status !== 0) {
  must("pg_ctl", ["-D", PGDATA, "-o", `-p ${PG_PORT} -k /tmp -c listen_addresses=127.0.0.1`, "-l", join(DIR, "pg.log"), "-w", "start"]);
}

log("Punim bazu izmišljenim podacima …");
psql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`]);
psql(["-d", "postgres", "-c", `CREATE DATABASE ${DB}`]);
psql(["-d", DB], {
  input: `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF;
    END $$;
    GRANT anon, authenticated, service_role TO authenticator;
    -- Supabase grants the API roles everything by default; migrations narrow it.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $f$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::UUID
    $f$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `,
});
const migrations = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
for (const f of migrations) psql(["-1", "-d", DB, "-f", join(ROOT, "supabase", "migrations", f)]);
const seedSql = must("node", [join(import.meta.dirname, "seed.mjs")], { maxBuffer: 64 * 1024 * 1024 });
psql(["-d", DB], { input: seedSql, maxBuffer: 64 * 1024 * 1024 });
psql(["-d", DB, "-c", "NOTIFY pgrst, 'reload schema'"]);

// ── 2. PostgREST + gateway ───────────────────────────────────────────────────
const restConf = join(DIR, "postgrest.conf");
writeFileSync(restConf, [
  `db-uri = "postgres://authenticator@127.0.0.1:${PG_PORT}/${DB}"`,
  `db-schemas = "public"`,
  `db-anon-role = "anon"`,
  `db-max-rows = 1000`,
  `jwt-secret = "${JWT_SECRET}"`,
  `server-host = "127.0.0.1"`,
  `server-port = ${REST_PORT}`,
  `log-level = "error"`,
].join("\n"));
children.push(spawn("postgrest", [restConf], { stdio: ["ignore", "inherit", "inherit"] }));

// supabase-js talks to <url>/rest/v1, <url>/auth/v1 and <url>/realtime/v1.
// Only REST is real; auth says "no session" and realtime is refused.
const gateway = http.createServer((req, res) => {
  if (req.url.startsWith("/rest/v1")) {
    const upstream = http.request(
      { host: "127.0.0.1", port: REST_PORT, path: req.url.slice("/rest/v1".length) || "/", method: req.method, headers: req.headers },
      (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); }
    );
    upstream.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
    return;
  }
  res.writeHead(401, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify({ message: "demo: no auth" }));
});
// A stand-in Realtime server: accepts every channel join and answers
// heartbeats, so the app shows "connected" instead of a red error. It never
// sends changes (Phoenix protocol, serializer vsn 2.0.0: JSON arrays).
gateway.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!req.url.startsWith("/realtime/v1/websocket") || !key) return socket.destroy();
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);

  const send = (msg) => {
    const data = Buffer.from(JSON.stringify(msg));
    const head = data.length < 126 ? Buffer.from([0x81, data.length])
      : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
    socket.write(Buffer.concat([head, data]));
  };
  const onMessage = (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!Array.isArray(msg)) return;
    const [joinRef, ref, topic, event, payload] = msg;
    if (event === "phx_join") {
      const changes = (payload?.config?.postgres_changes ?? []).map((c, i) => ({ id: i + 1, ...c }));
      send([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: changes } }]);
    } else if (event === "heartbeat" || event === "phx_leave") {
      send([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]);
    }
  };

  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 0x80;
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      buf = buf.subarray(total);
      if (opcode === 1) onMessage(data.toString("utf8"));
      else if (opcode === 9) socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data]));
      else if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
    }
  });
  socket.on("error", () => socket.destroy());
});
gateway.listen(GATEWAY_PORT, "127.0.0.1");

// ── 3. Next.js ───────────────────────────────────────────────────────────────
// Every key from .env.local is blanked (Next does not override a variable that
// is already set), so no real token can reach the demo process.
const blanked = {};
for (const file of [".env.local", ".env", ".env.development", ".env.development.local"]) {
  const p = join(ROOT, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=/);
    if (m) blanked[m[1]] = "";
  }
}
const env = {
  ...process.env,
  ...blanked,
  ORDERLY_DEMO: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
  // The browser reads as the demo owner, like a signed-in session would.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "authenticated", sub: DEMO_AUTH_USER_ID }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role" }),
  CRON_SECRET: "demo",
};
log(`Orderly demo: http://localhost:${APP_PORT}`);
const next = spawn(join(ROOT, "node_modules", ".bin", "next"), ["dev", "-p", String(APP_PORT)], { cwd: ROOT, env, stdio: "inherit" });
children.push(next);

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  gateway.close();
  run("pg_ctl", ["-D", PGDATA, "-m", "fast", "stop"]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", shutdown);
