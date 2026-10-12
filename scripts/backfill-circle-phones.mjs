// Fills customer_phone on Stripe orders that arrived without one, using the
// phone from the buyer's Circle profile (sites.circle_token). Safe to re-run:
// it only touches orders whose phone is still empty.
//
//   node --env-file=.env.local scripts/backfill-circle-phones.mjs           dry run
//   node --env-file=.env.local scripts/backfill-circle-phones.mjs --apply   write

const APPLY = process.argv.includes("--apply");
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

const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const PHONE_KEY = /telefon|phone|mobil/i;

async function circlePhone(circleToken, email) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://app.circle.so/api/admin/v2/community_members/search?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${circleToken}` } }
    );
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) return null;
    const fields = (await res.json())?.flattened_profile_fields ?? {};
    for (const [k, v] of Object.entries(fields))
      if (PHONE_KEY.test(k) && typeof v === "string" && v.trim()) return v.trim();
    return null;
  }
  return null;
}

const sites = await query("SELECT id, name, circle_token FROM sites WHERE circle_token IS NOT NULL");
for (const site of sites) {
  const rows = await query(
    `SELECT DISTINCT lower(customer_email) AS email FROM orders
     WHERE site_id = ${quote(site.id)} AND source = 'stripe'
       AND coalesce(trim(customer_phone), '') = '' AND customer_email IS NOT NULL`
  );
  console.log(`${site.name}: ${rows.length} emails without a phone`);

  // Look everything up first, then write in one statement — the Management API
  // throttles a query per row.
  const found = [];
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const phones = await Promise.all(batch.map((r) => circlePhone(site.circle_token, r.email)));
    batch.forEach((r, j) => phones[j] && found.push([r.email, phones[j]]));
    process.stdout.write(`\r  ${Math.min(i + 5, rows.length)}/${rows.length} checked, ${found.length} phones found`);
  }

  let updated = 0;
  if (APPLY && found.length) {
    const values = found.map(([e, p]) => `(${quote(e)}, ${quote(p)})`).join(", ");
    const res = await query(
      `UPDATE orders o SET customer_phone = v.phone
       FROM (VALUES ${values}) AS v(email, phone)
       WHERE o.site_id = ${quote(site.id)} AND o.source = 'stripe'
         AND lower(o.customer_email) = v.email
         AND coalesce(trim(o.customer_phone), '') = '' RETURNING o.id`
    );
    updated = res.length;
  }
  console.log(APPLY ? `\n  updated ${updated} orders` : "\n  dry run — pass --apply to write");
}
