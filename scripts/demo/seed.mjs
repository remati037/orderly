// Prints SQL that fills the demo database with made-up data: Sajt 1–4,
// Kupac 1…, Nalog 1–3, Kampanja 1…. Nothing here comes from the real database.
// Dates are relative to now, so the demo always has today's orders.
//
//   node scripts/demo/seed.mjs | psql …

import { DEMO_AUTH_USER_ID, DEMO_ORG_ID } from "./ids.mjs";

// ── deterministic random ─────────────────────────────────────────────────────
let seed = 20261112;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
let uuidN = 0;
const uuid = (prefix = "d") => {
  uuidN++;
  const hex = uuidN.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8${prefix.padEnd(3, "0").slice(0, 3)}-${hex}`;
};

// ── SQL helpers ──────────────────────────────────────────────────────────────
const q = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) return `ARRAY[${v.map(q).join(",")}]::text[]`;
  if (typeof v === "object") return `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
  return `'${String(v).replaceAll("'", "''")}'`;
};
const out = [];
function insert(table, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    out.push(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` +
        chunk.map((r) => `(${cols.map((c) => q(r[c])).join(", ")})`).join(",\n") +
        ";"
    );
  }
}

const NOW = new Date();
const DAY = 86_400_000;
const daysAgo = (d) => new Date(NOW.getTime() - d * DAY);
const isoDate = (d) => d.toISOString().slice(0, 10);
const org = DEMO_ORG_ID;

// ── organization, team, settings ─────────────────────────────────────────────
out.push(`UPDATE organizations SET name = 'Demo' WHERE id = '${org}';`);
out.push(`INSERT INTO auth.users (id, email) VALUES ('${DEMO_AUTH_USER_ID}', 'demo@orderly.app');`);

const owner = { id: uuid("a"), auth_user_id: DEMO_AUTH_USER_ID, email: "demo@orderly.app", name: "Demo vlasnik", role: "owner", is_active: true, org_id: org };
const agents = [1, 2].map((n) => ({ id: uuid("a"), auth_user_id: null, email: `agent${n}@orderly.app`, name: `Agent ${n}`, role: "agent", is_active: true, org_id: org }));
insert("team_members", [owner, ...agents]);

// ── sites & products ─────────────────────────────────────────────────────────
const SITES = [
  { name: "Sajt 1", platform: "woocommerce", project_type: "digital", color_hex: "#6366f1", currency: "EUR", weight: 4,
    products: [["Proizvod A", 49, "digital"], ["Proizvod B", 97, "digital"], ["Paket C", 197, "digital"]] },
  { name: "Sajt 2", platform: "woocommerce", project_type: "standard", color_hex: "#10b981", currency: "EUR", weight: 3,
    products: [["Proizvod D", 29, "physical"], ["Proizvod E", 59, "physical"], ["Set F", 89, "physical"]] },
  { name: "Sajt 3", platform: "stripe", project_type: "subscription", color_hex: "#f59e0b", currency: "EUR", weight: 2,
    products: [["Članarina G", 19, "subscription"], ["Članarina H godišnja", 190, "subscription"]] },
  { name: "Sajt 4", platform: "woocommerce", project_type: "digital", color_hex: "#ec4899", currency: "EUR", weight: 2,
    products: [["Proizvod I", 39, "digital"], ["Proizvod J", 99, "digital"]] },
];
const sites = SITES.map((s, i) => ({
  ...s,
  id: uuid("b"),
  url: `https://sajt${i + 1}.example`,
}));
insert("sites", sites.map((s) => ({
  id: s.id, name: s.name, platform: s.platform, url: s.url, project_type: s.project_type,
  color_hex: s.color_hex, is_active: true, default_margin_percent: 80, org_id: org,
  consumer_key: s.platform === "woocommerce" ? "ck_demo" : null,
  consumer_secret: s.platform === "woocommerce" ? "cs_demo" : null,
})));

const products = [];
for (const s of sites) {
  s.productRows = s.products.map(([name, price, type], i) => {
    const p = { id: uuid("c"), site_id: s.id, woo_product_id: String(100 + i), name, product_type: type,
      cost_percent: type === "physical" ? 35 : 10, cost_fixed: 0, org_id: org, price };
    products.push(p);
    return p;
  });
}
insert("products", products.map(({ price, ...p }) => p));

const bonusShares = { [sites[1].id]: 0.5, [sites[3].id]: 0.5 };
const year = NOW.getFullYear();
const month = String(NOW.getMonth() + 1).padStart(2, "0");
const lastDay = new Date(year, NOW.getMonth() + 1, 0).getDate();
const settings = [
  ["base_currency", "EUR"],
  ["exchange_rates", { EUR: 1, RSD: 0.00855, USD: 0.92 }],
  ["bonus_program", {
    name: "Akcija meseca", from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}`,
    tiers: [{ from: 8000, amount: 240 }, { from: 12000, amount: 360 }, { from: 16000, amount: 900 },
            { from: 20000, amount: 1200 }, { from: 25000, amount: 2500 }, { from: 30000, amount: 3500 }],
    people: 4, site_shares: bonusShares,
    product_goals: { [sites[0].id]: { "Proizvod B": 4000, "Paket C": 6000 } },
  }],
];
for (const [key, value] of settings) {
  out.push(`DELETE FROM settings WHERE key = ${q(key)};`);
  out.push(`INSERT INTO settings (key, value, org_id) VALUES (${q(key)}, ${q(JSON.stringify(value))}::jsonb, '${org}');`);
}

// ── customers ────────────────────────────────────────────────────────────────
const CITIES = ["Beograd", "Novi Sad", "Niš", "Kragujevac", "Subotica", "Čačak", "Zagreb", "Sarajevo", "Banja Luka", "Podgorica"];
const customers = Array.from({ length: 420 }, (_, i) => {
  const n = i + 1;
  return { id: uuid("e"), email: `kupac${n}@example.com`, name: `Kupac ${n}`, city: pick(CITIES),
    country: "RS", org_id: org, phone: `+38160000${String(n).padStart(4, "0")}` };
});
insert("customers", customers.map(({ phone, ...c }) => ({ ...c, created_at: daysAgo(200) })));

// ── orders ───────────────────────────────────────────────────────────────────
const HISTORY_DAYS = 160;
const orders = [];
const items = [];
const refunds = [];
const wooNo = Object.fromEntries(sites.map((s, i) => [s.id, 1000 + i * 3000]));
const UTM = [
  [{ utm_source: "facebook", utm_medium: "paid", source_type: "utm" }, 45],
  [{ utm_source: "instagram", utm_medium: "paid", source_type: "utm" }, 20],
  [{ utm_source: "google", utm_medium: "organic", source_type: "organic" }, 12],
  [{ utm_source: null, utm_medium: null, source_type: "typein" }, 15],
  [{ utm_source: "email", utm_medium: "newsletter", source_type: "utm" }, 8],
];

for (let d = HISTORY_DAYS; d >= 0; d--) {
  const dayStart = new Date(NOW.getTime() - d * DAY);
  dayStart.setHours(0, 0, 0, 0);
  // Slow growth over time, a weekly rhythm and a promo bump this month.
  const growth = 0.6 + 0.6 * (1 - d / HISTORY_DAYS);
  const weekday = [0.8, 1.1, 1.05, 1, 1, 0.95, 0.75][dayStart.getDay()];
  const promo = dayStart.getMonth() === NOW.getMonth() && dayStart.getFullYear() === NOW.getFullYear() ? 1.35 : 1;
  for (const s of sites) {
    // Today is a good day, so the "vs juče" arrows point up on camera.
    const expected = s.weight * 1.6 * growth * weekday * promo * (d === 0 ? 1.7 : 1);
    let count = Math.max(0, Math.round(expected + (rnd() - 0.5) * expected));
    for (let k = 0; k < count; k++) {
      // Hours lean towards evening; today stops at the current time.
      const hour = weighted([[8, 2], [10, 4], [12, 5], [14, 5], [16, 6], [18, 8], [20, 9], [21, 7], [22, 5], [23, 2]]);
      const at = new Date(dayStart.getTime() + (hour * 60 + int(0, 59)) * 60_000 + int(0, 59) * 1000);
      if (at > NOW) continue;

      const customer = pick(customers);
      const prod = weighted(s.productRows.map((p, i) => [p, [5, 3, 1.5][i] ?? 1]));
      const qty = s.project_type === "standard" && rnd() < 0.2 ? 2 : 1;
      const total = prod.price * qty;
      const ageDays = (NOW - at) / DAY;
      let status = weighted([["completed", 78], ["processing", 6], ["failed", 6], ["pending", 3], ["on-hold", 4], ["cancelled", 2], ["refunded", 1.5]]);
      if (ageDays > 20 && status === "processing") status = "completed";
      if (ageDays < 0.5 && s.project_type === "standard" && rnd() < 0.5) status = "processing";

      const payment_method = s.platform === "stripe" ? "stripe" : weighted([["stripe", 70], ["bacs", 20], ["cod", 10]]);
      const fee = payment_method === "stripe" ? total * 0.029 + (s.currency === "RSD" ? 30 : 0.25) : 0;
      const cost = total * (prod.cost_percent / 100);
      const id = uuid("f");
      wooNo[s.id]++;
      const utm = weighted(UTM);
      const order = {
        id, site_id: s.id, org_id: org,
        woo_order_id: s.platform === "stripe" ? `pi_demo${wooNo[s.id]}` : String(wooNo[s.id]),
        source: s.platform, status, total, currency: s.currency,
        net_profit: ["completed", "processing"].includes(status) ? total - fee - cost : 0,
        processor_fee: fee,
        customer_name: customer.name, customer_email: customer.email, customer_city: customer.city,
        customer_phone: customer.phone, product_type: prod.product_type === "physical" ? "physical" : prod.product_type,
        payment_type: s.platform === "stripe" ? "card" : payment_method, payment_method,
        woo_data: null, created_at: at, updated_at: at,
        utm_source: utm.utm_source, utm_medium: utm.utm_medium, source_type: utm.source_type,
        utm_campaign: utm.utm_medium === "paid" ? pick(["kampanja-1", "kampanja-2", "kampanja-3"]) : null,
        device_type: weighted([["Mobile", 72], ["Desktop", 25], ["Tablet", 3]]),
        refunded_total: 0,
      };
      orders.push(order);
      items.push({ id: uuid("9"), order_id: id, product_name: prod.name, product_type: prod.product_type,
        quantity: qty, price: prod.price, cost, org_id: org, created_at: at });

      const refundAt = new Date(at.getTime() + int(2, 10) * DAY);
      if (status === "completed" && rnd() < 0.025 && refundAt < daysAgo(1)) {
        const amount = rnd() < 0.6 ? total : Math.round(total * 0.5);
        refunds.push({ id: uuid("7"), org_id: org, order_id: id, site_id: s.id,
          source: s.platform === "stripe" ? "stripe" : "woocommerce", external_id: `rf_demo_${refunds.length + 1}`,
          amount, currency: s.currency, reason: pick(["Kupac se predomislio", "Duplo plaćanje", "Nezadovoljan proizvodom"]),
          refunded_at: refundAt });
      }
    }
  }
}
insert("orders", orders);
insert("order_items", items);
insert("refunds", refunds);

// ── recovery (naplata) ───────────────────────────────────────────────────────
// Tasks are opened by the orders trigger; give the recent ones some history.
const NOTES = [
  ["telefon", "Pozvan, ne javlja se. Probati sutra."],
  ["telefon", "Razgovarali, kaže da će platiti danas."],
  ["email", "Poslat podsetnik sa linkom za plaćanje."],
  ["napomena", "Kartica odbijena dva puta, predložiti uplatnicu."],
  ["sms", "Poslat SMS podsetnik."],
];
out.push(`
WITH t AS (
  SELECT rt.id, row_number() OVER (ORDER BY o.created_at DESC) AS n
    FROM recovery_tasks rt JOIN orders o ON o.id = rt.order_id
   WHERE rt.stage = 'novo' AND o.created_at > now() - interval '30 days'
)
UPDATE recovery_tasks rt
   SET stage = CASE WHEN t.n % 5 = 1 THEN 'kontaktiran' WHEN t.n % 5 = 2 THEN 'ceka_uplatu' ELSE rt.stage END,
       attempts = CASE WHEN t.n % 5 IN (1, 2) THEN (t.n % 3) + 1 ELSE 0 END,
       last_contacted_at = CASE WHEN t.n % 5 IN (1, 2) THEN now() - (t.n || ' hours')::interval END,
       assigned_to = CASE WHEN t.n % 2 = 0 THEN '${agents[0].id}'::uuid ELSE '${agents[1].id}'::uuid END
  FROM t WHERE rt.id = t.id;

INSERT INTO recovery_notes (task_id, author_id, channel, body, created_at, org_id)
SELECT rt.id, CASE WHEN row_number() OVER () % 2 = 0 THEN '${agents[0].id}'::uuid ELSE '${agents[1].id}'::uuid END,
       (ARRAY[${NOTES.map(([c]) => q(c)).join(",")}])[1 + (row_number() OVER () % ${NOTES.length})],
       (ARRAY[${NOTES.map(([, b]) => q(b)).join(",")}])[1 + (row_number() OVER () % ${NOTES.length})],
       rt.last_contacted_at, '${org}'
  FROM recovery_tasks rt WHERE rt.stage IN ('kontaktiran', 'ceka_uplatu');

INSERT INTO sms_outbox (task_id, step, to_number, body, status, due_at, org_id)
SELECT rt.id, 1, o.customer_phone,
       s.name || ': Placanje za porudzbinu #' || o.woo_order_id || ' nije proslo. Zavrsite ga ovde: https://sajt.example/placanje',
       'pending_approval', now(), '${org}'
  FROM recovery_tasks rt JOIN orders o ON o.id = rt.order_id JOIN sites s ON s.id = o.site_id
 WHERE rt.stage = 'novo' AND o.customer_phone IS NOT NULL AND o.created_at > now() - interval '3 days'
 LIMIT 4;

INSERT INTO processing_calls (order_id, called_by, called_at, org_id)
SELECT o.id, '${agents[0].id}', o.created_at + interval '2 hours', '${org}'
  FROM orders o WHERE o.status = 'processing' AND o.created_at < now() - interval '1 day'
 LIMIT 5;
`);

// ── subscriptions (Sajt 3) ───────────────────────────────────────────────────
const subSite = sites[2];
const subs = customers.slice(0, 140).map((c, i) => {
  const yearly = i % 6 === 0;
  // Every 7th started this month, so "Novi ovog meseca" has something in it.
  const started = i % 7 === 0 ? daysAgo(int(0, NOW.getDate() - 1) + rnd() * 0.5) : daysAgo(int(5, 300));
  const status = i % 7 === 0
    ? (i % 70 === 0 ? "cancelled" : "active")
    : weighted([["active", 70], ["cancelled", 20], ["trial", 6], ["paused", 4]]);
  const mrr = yearly ? 190 / 12 : 19;
  return { id: uuid("6"), customer_id: c.id, site_id: subSite.id, org_id: org,
    product_name: yearly ? "Članarina H godišnja" : "Članarina G",
    mrr, mrr_amount: mrr, mrr_currency: "EUR", status, started_at: started,
    cancelled_at: status === "cancelled" ? new Date(Math.min(NOW, started.getTime() + int(20, 120) * DAY)) : null,
    next_billing_at: status === "active" || status === "trial" ? new Date(NOW.getTime() + int(1, 30) * DAY) : null,
    stripe_subscription_id: `sub_demo${i + 1}` };
});
insert("subscriptions", subs);

// ── Meta ads ─────────────────────────────────────────────────────────────────
const accounts = [
  { name: "Nalog 1", short_name: "N1", site: sites[0] },
  { name: "Nalog 2", short_name: "N2", site: sites[1] },
  { name: "Nalog 3", short_name: "N3", site: sites[3] },
].map((a, i) => ({ ...a, id: uuid("5"), fb_account_id: `act_00000000${i + 1}` }));
insert("ad_accounts", accounts.map((a) => ({
  id: a.id, name: a.name, short_name: a.short_name, fb_account_id: a.fb_account_id, access_token: "demo",
  currency: "EUR", is_active: true, last_synced_at: NOW, live_synced_at: NOW, meta_account_status: 1,
  site_id: a.site.id, org_id: org,
})));
out.push(`DELETE FROM settings WHERE key = 'meta_live';`);
insert("settings", [{ key: "meta_live", value: { target_cpa: Object.fromEntries(accounts.map((a, i) => [a.id, [18, 12, 25][i]])) }, org_id: org }]);

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
const thumb = (n) => {
  const c = COLORS[n % COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="14" fill="${c}"/><circle cx="60" cy="48" r="22" fill="white" opacity=".35"/><rect x="24" y="80" width="72" height="12" rx="6" fill="white" opacity=".6"/><text x="60" y="56" font-family="Arial" font-size="20" font-weight="700" fill="white" text-anchor="middle">${n}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

const insights = [];
const spend = [];
const campaignMap = [];
let campN = 0, adsetN = 0, adN = 0;
for (const acc of accounts) {
  const campCount = acc.short_name === "N1" ? 3 : 2;
  for (let c = 0; c < campCount; c++) {
    campN++;
    const campaign = { id: `c_demo_${campN}`, name: `Kampanja ${campN}` };
    campaignMap.push({ campaign_id: campaign.id, ad_account_id: acc.id, campaign_name: campaign.name,
      site_id: acc.site.id, product_name: acc.site.productRows[c % acc.site.productRows.length].name, org_id: org });
    const campaignPaused = campN === 4;
    const campSpend = {};
    for (let a = 0; a < 2; a++) {
      adsetN++;
      const adset = { id: `as_demo_${adsetN}`, name: `Ad set ${campN}${"AB"[a]}` };
      for (let k = 0; k < 3; k++) {
        adN++;
        const ad = { id: `ad_demo_${adN}`, name: `Oglas ${adN}`, thumb: thumb(adN) };
        // Each ad gets its own quality: some scale, some should be turned off.
        const quality = [2.8, 1.6, 0.6, 3.6, 1.1, 0.35][(adN - 1) % 6] * (acc.short_name === "N3" ? 0.8 : 1);
        const baseSpend = [14, 9, 6, 11, 7, 4][(adN - 1) % 6];
        const startedDaysAgo = adN % 7 === 0 ? 2 : 30;
        const pausedFrom = campaignPaused ? 6 : quality < 0.5 ? 9 : -1;
        for (let d = Math.min(30, startedDaysAgo); d >= 0; d--) {
          const date = isoDate(daysAgo(d));
          const active = pausedFrom < 0 || d > pausedFrom;
          let sp = active ? baseSpend * (0.7 + rnd() * 0.6) : 0;
          if (d === 0) sp *= Math.min(1, (NOW.getHours() + NOW.getMinutes() / 60) / 24);
          const impressions = Math.round(sp * (90 + rnd() * 40));
          const clicks = Math.round(impressions * (0.009 + rnd() * 0.012));
          const lpv = Math.round(clicks * (0.7 + rnd() * 0.2));
          const atc = Math.round(lpv * (0.12 + rnd() * 0.1));
          const ic = Math.round(atc * (0.5 + rnd() * 0.3));
          const avgPrice = acc.site.currency === "RSD" ? 55 : acc.site.productRows[0].price;
          const purchases = Math.max(0, Math.round((sp * quality) / avgPrice + (rnd() - 0.5) * 0.8));
          insights.push({
            ad_account_id: acc.id, campaign_id: campaign.id, campaign_name: campaign.name,
            adset_id: adset.id, adset_name: adset.name, ad_id: ad.id, ad_name: ad.name, date,
            spend: sp, impressions, reach: Math.round(impressions * 0.75), frequency: 1.3 + rnd() * 0.6,
            inline_link_clicks: clicks, ctr: impressions ? (clicks / impressions) * 100 : 0,
            cpm: impressions ? (sp / impressions) * 1000 : 0, purchases,
            purchase_value: purchases * avgPrice * (0.9 + rnd() * 0.3), add_to_cart: atc, initiate_checkout: ic,
            leads: 0, landing_page_views: lpv,
            effective_status: pausedFrom >= 0 ? "PAUSED" : "ACTIVE", thumbnail_url: ad.thumb, org_id: org, updated_at: NOW,
          });
          campSpend[date] = (campSpend[date] ?? 0) + sp;
        }
      }
    }
    for (const [date, sp] of Object.entries(campSpend)) {
      spend.push({ ad_account_id: acc.id, campaign_id: campaign.id, date, spend: sp, currency: "EUR", org_id: org });
    }
  }
}
insert("ad_campaign_map", campaignMap);
insert("ad_insights_daily", insights);
insert("ad_spend", spend);

insert("ad_recommendations", [
  { ad_account_id: accounts[0].id, level: "ad", entity_id: "ad_demo_4", entity_name: "Oglas 4", type: "skaliraj", priority: 1,
    text: "ROAS 3,5 u poslednjih 7 dana uz stabilnu cenu kupovine. Podići budžet ad seta za 20%.", status: "open", org_id: org },
  { ad_account_id: accounts[0].id, level: "ad", entity_id: "ad_demo_6", entity_name: "Oglas 6", type: "ugasi", priority: 1,
    text: "Troši bez kupovina 5 dana zaredom, cena po kupovini 3× iznad cilja.", status: "open", org_id: org },
  { ad_account_id: accounts[1].id, level: "adset", entity_id: "as_demo_7", entity_name: "Ad set 4A", type: "osvezi_kreativu", priority: 2,
    text: "Frekvencija preko 1,8 i CTR pada treću nedelju. Ubaciti 2 nove kreative.", status: "open", org_id: org },
  { ad_account_id: accounts[2].id, level: "campaign", entity_id: "c_demo_6", entity_name: "Kampanja 6", type: "proveri", priority: 3,
    text: "Kupovine na Meti i porudžbine na sajtu se razilaze. Proveriti piksel.", status: "open", org_id: org },
]);

// ── misc ─────────────────────────────────────────────────────────────────────
insert("sync_log", sites.flatMap((s) => [0, 1, 2].map((h) => ({
  site_id: s.id, type: h === 0 ? "webhook" : "cron", status: "success", orders_synced: int(1, 12),
  created_at: new Date(NOW.getTime() - h * 3_600_000 - int(0, 50) * 60_000), org_id: org,
}))));

// Derived tables, computed the same way production does.
out.push(`SELECT refresh_all_customer_totals();`);
out.push(`SELECT rebuild_daily_stats();`);

process.stdout.write("BEGIN;\n" + out.join("\n") + "\nCOMMIT;\n");
