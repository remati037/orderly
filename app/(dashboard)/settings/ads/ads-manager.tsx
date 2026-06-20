"use client";

import { useEffect, useState, useCallback } from "react";

interface AdAccount {
  id: string;
  name: string;
  fb_account_id: string;
  currency: string;
  is_active: boolean;
  last_synced_at: string | null;
}

interface Site { id: string; name: string; color_hex: string }

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  site_id: string | null;
  product_name: string | null;
  spend: number;
}

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E4E4E7",
  borderRadius: 12,
  padding: "20px 22px",
  marginBottom: 16,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  padding: "8px 10px",
  border: "1px solid #E4E4E7",
  borderRadius: 7,
  outline: "none",
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#71717A",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  display: "block",
  marginBottom: 4,
};

function btn(primary = false): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 14px",
    borderRadius: 7,
    border: "1px solid",
    cursor: "pointer",
    background: primary ? "#1B6EF3" : "#fff",
    borderColor: primary ? "#1B6EF3" : "#E4E4E7",
    color: primary ? "#fff" : "#52525B",
  };
}

export default function AdsManager() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [productsBySite, setProductsBySite] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({ name: "", fb_account_id: "", access_token: "", currency: "EUR" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/ads/accounts");
    if (res.ok) setAccounts(await res.json());
  }, []);

  const loadMapping = useCallback(async () => {
    const res = await fetch("/api/ads/mapping");
    if (res.ok) {
      const json = await res.json();
      setCampaigns(json.campaigns ?? []);
      setSites(json.sites ?? []);
      setProductsBySite(json.products_by_site ?? {});
    }
  }, []);

  useEffect(() => { loadAccounts(); loadMapping(); }, [loadAccounts, loadMapping]);

  async function connect() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/ads/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(`Greška: ${json.error}`); return; }
      setForm({ name: "", fb_account_id: "", access_token: "", currency: "EUR" });
      setMsg("Nalog povezan. Klikni Sync da povučeš potrošnju.");
      await loadAccounts();
    } finally { setBusy(false); }
  }

  async function sync(id: string) {
    setBusy(true); setMsg("Sinhronizacija u toku…");
    try {
      const res = await fetch(`/api/ads/sync/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(`Greška: ${json.error}`); return; }
      setMsg(`Povučeno: ${json.rows} dnevnih zapisa, ${json.campaigns} kampanja.`);
      await Promise.all([loadAccounts(), loadMapping()]);
    } finally { setBusy(false); }
  }

  async function removeAccount(id: string) {
    if (!confirm("Obrisati nalog i svu potrošnju?")) return;
    await fetch(`/api/ads/accounts?id=${id}`, { method: "DELETE" });
    await Promise.all([loadAccounts(), loadMapping()]);
  }

  async function saveMapping(c: Campaign, siteId: string, productName: string) {
    setCampaigns((prev) =>
      prev.map((x) => x.campaign_id === c.campaign_id
        ? { ...x, site_id: siteId || null, product_name: productName || null }
        : x)
    );
    await fetch("/api/ads/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: c.campaign_id, site_id: siteId || null, product_name: productName || null }),
    });
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#18181B", marginBottom: 4 }}>
        Facebook Ads
      </h1>
      <p style={{ fontSize: 13, color: "#71717A", marginBottom: 20 }}>
        Poveži Meta ad nalog, povuci potrošnju i mapiraj kampanje na proizvode da bi se reklama oduzela od profita.
      </p>

      {msg && (
        <div style={{ ...CARD, padding: "12px 16px", fontSize: 13, color: "#18181B", background: "#F4F4F5" }}>
          {msg}
        </div>
      )}

      {/* Connect form */}
      <div style={CARD}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 14 }}>
          Poveži novi nalog
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={LABEL}>Naziv</label>
            <input style={INPUT} placeholder="npr. Glavni FB nalog"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label style={LABEL}>Ad Account ID</label>
            <input style={INPUT} placeholder="act_1234567890"
              value={form.fb_account_id} onChange={(e) => setForm({ ...form, fb_account_id: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / 3" }}>
            <label style={LABEL}>System User Token</label>
            <input style={INPUT} type="password" placeholder="EAAB…"
              value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} />
          </div>
          <div>
            <label style={LABEL}>Valuta naloga</label>
            <input style={INPUT} placeholder="EUR"
              value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
        </div>
        <button style={btn(true)} disabled={busy} onClick={connect}>Poveži nalog</button>
      </div>

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div style={CARD}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 14 }}>
            Povezani nalozi
          </span>
          {accounts.map((a) => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0", borderTop: "1px solid #F4F4F5",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>{a.name}</div>
                <div style={{ fontSize: 12, color: "#A1A1AA" }}>
                  {a.fb_account_id} · {a.currency}
                  {a.last_synced_at ? ` · sync ${new Date(a.last_synced_at).toLocaleString("sr-RS")}` : " · nije sinhronizovan"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn(true)} disabled={busy} onClick={() => sync(a.id)}>Sync 30 dana</button>
                <button style={btn()} disabled={busy} onClick={() => removeAccount(a.id)}>Obriši</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign mapping */}
      {campaigns.length > 0 && (
        <div style={CARD}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 4 }}>
            Mapiranje kampanja
          </span>
          <p style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 14 }}>
            Izaberi sajt i (opciono) proizvod za svaku kampanju. Bez proizvoda, potrošnja se vezuje za ceo sajt.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 150px 170px", gap: 10, alignItems: "center" }}>
            {campaigns.map((c) => (
              <Row key={c.campaign_id} c={c} sites={sites} productsBySite={productsBySite} onSave={saveMapping} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ c, sites, productsBySite, onSave }: {
  c: Campaign;
  sites: Site[];
  productsBySite: Record<string, string[]>;
  onSave: (c: Campaign, siteId: string, productName: string) => void;
}) {
  const products = c.site_id ? productsBySite[c.site_id] ?? [] : [];
  const select: React.CSSProperties = { ...INPUT, padding: "6px 8px", fontSize: 12 };
  return (
    <>
      <div style={{ fontSize: 13, color: "#18181B", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {c.campaign_name}
      </div>
      <div style={{ fontSize: 12, color: "#71717A", textAlign: "right", whiteSpace: "nowrap" }}>
        {c.spend.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <select style={select} value={c.site_id ?? ""}
        onChange={(e) => onSave(c, e.target.value, "")}>
        <option value="">— sajt —</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select style={select} value={c.product_name ?? ""} disabled={!c.site_id}
        onChange={(e) => onSave(c, c.site_id ?? "", e.target.value)}>
        <option value="">Ceo sajt</option>
        {products.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </>
  );
}
