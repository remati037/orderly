// Creates a paid, completed WooCommerce order (bank transfer) for a customer who
// paid us directly, then pulls it into Orderly via the normal site sync.
//
//   npm run woo:order -- --site "Naziv sajta" --email ime@mail.com --product "Godišnja" --amount 120
//       [--date 2026-10-08] [--note "tekst"]            dry run: prints what would be created
//   ... --yes                                             actually creates the order
//
// Billing details are copied from the customer's latest Woo order (or Woo customer
// record) so the order matches their existing profile. Needs the same .env.local as db.mjs.

import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    site: { type: "string" },
    email: { type: "string" },
    product: { type: "string" },
    amount: { type: "string" },
    date: { type: "string" },
    note: { type: "string" },
    // New customer (no existing Woo billing data): pass the details explicitly.
    first: { type: "string" },
    last: { type: "string" },
    company: { type: "string" },
    address: { type: "string" },
    city: { type: "string" },
    postcode: { type: "string" },
    country: { type: "string", default: "RS" },
    phone: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});
for (const k of ["site", "email", "product", "amount"]) {
  if (!a[k]) {
    console.error(`Missing --${k}`);
    process.exit(1);
  }
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !projectRef) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}
const q = (s) => `'${s.replaceAll("'", "''")}'`;

const sites = await sql(
  `select id, name, url, consumer_key, consumer_secret from sites
   where platform = 'woocommerce' and name ilike ${q(`%${a.site}%`)}`
);
if (sites.length !== 1) {
  console.error(sites.length ? `Ambiguous site: ${sites.map((s) => s.name).join(", ")}` : "No matching Woo site");
  process.exit(1);
}
const site = sites[0];
const auth = `Basic ${Buffer.from(`${site.consumer_key}:${site.consumer_secret}`).toString("base64")}`;

async function woo(path, init = {}) {
  const res = await fetch(`${site.url}/wp-json/wc/v3/${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Woo ${path}: HTTP ${res.status} ${body?.message ?? ""}`);
  return body;
}

// Product: numeric id, or name search that must resolve to exactly one product.
let product;
if (/^\d+$/.test(a.product)) {
  product = await woo(`products/${a.product}`);
} else {
  const found = await woo(`products?search=${encodeURIComponent(a.product)}&per_page=20`);
  if (found.length !== 1) {
    console.error(
      found.length
        ? `Ambiguous product, pass an id:\n${found.map((p) => `  ${p.id}  ${p.name}`).join("\n")}`
        : "No matching product"
    );
    process.exit(1);
  }
  product = found[0];
}

// Billing: latest order for this email, else the Woo customer record.
const email = a.email.trim().toLowerCase();
const prior = await woo(`orders?search=${encodeURIComponent(email)}&per_page=1&orderby=date&order=desc`);
const customers = await woo(`customers?email=${encodeURIComponent(email)}`);
let billing = prior[0]?.billing?.email?.toLowerCase() === email ? prior[0].billing : customers[0]?.billing;
if (!billing?.email) {
  if (!a.first || !a.last) {
    console.error(`No existing Woo billing data for ${email} — pass --first and --last (plus optional --company --address --city --postcode --country --phone).`);
    process.exit(1);
  }
  billing = {
    first_name: a.first,
    last_name: a.last,
    company: a.company ?? "",
    address_1: a.address ?? "",
    address_2: "",
    city: a.city ?? "",
    postcode: a.postcode ?? "",
    country: a.country,
    state: "",
    email,
    phone: a.phone ?? "",
  };
}
const customerId = customers[0]?.id ?? prior[0]?.customer_id ?? 0;

const paidAt = a.date ? new Date(`${a.date}T12:00:00`) : new Date();
const payload = {
  status: "completed",
  set_paid: true,
  payment_method: "bacs",
  payment_method_title: "Uplata na račun",
  customer_id: customerId,
  billing,
  shipping: prior[0]?.shipping ?? undefined,
  line_items: [{ product_id: product.id, quantity: 1, total: String(a.amount), subtotal: String(a.amount) }],
  date_created: paidAt.toISOString().slice(0, 19),
  date_paid: paidAt.toISOString().slice(0, 19),
  customer_note: "",
  meta_data: [{ key: "_orderly_manual", value: "1" }],
};

console.log(`Site:     ${site.name} (${site.url})`);
console.log(`Customer: ${billing.first_name} ${billing.last_name} <${email}> (id ${customerId})`);
console.log(`Product:  ${product.name} (id ${product.id})`);
console.log(`Amount:   ${a.amount}   Date: ${payload.date_created}   Status: completed / bacs`);

if (!a.yes) {
  console.log("\nDry run — add --yes to create the order.");
  process.exit(0);
}

const order = await woo("orders", { method: "POST", body: JSON.stringify(payload) });
if (a.note) {
  await woo(`orders/${order.id}/notes`, {
    method: "POST",
    body: JSON.stringify({ note: a.note, customer_note: false }),
  });
}
console.log(`\nCreated Woo order #${order.id} (total ${order.total} ${order.currency}).`);
console.log("Orderly picks it up via the Woo webhook / next sync.");
