"use client";

import { useEffect, useState, useCallback } from "react";

interface TeamMember {
  id: string;
  clerk_user_id: string | null;
  email: string;
  name: string | null;
  role: "owner" | "agent";
  is_active: boolean;
  created_at: string;
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
    background: primary ? "#16A34A" : "#fff",
    borderColor: primary ? "#16A34A" : "#E4E4E7",
    color: primary ? "#fff" : "#52525B",
  };
}

export default function TeamManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState({ email: "", name: "", role: "agent" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team");
    if (res.ok) setMembers(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(`Greška: ${json.error}`); return; }
      setForm({ email: "", name: "", role: "agent" });
      setMsg("Član dodat. Pristup dobija čim se prvi put uloguje tim emailom.");
      await load();
    } finally { setBusy(false); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const json = await res.json();
    if (!res.ok) { setMsg(`Greška: ${json.error}`); return; }
    setMsg(null);
    await load();
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Ukloniti ${email} iz tima?`)) return;
    const res = await fetch(`/api/team?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { setMsg(`Greška: ${json.error}`); return; }
    await load();
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#18181B", marginBottom: 4 }}>
        Tim
      </h1>
      <p style={{ fontSize: 13, color: "#71717A", marginBottom: 20 }}>
        Vlasnik vidi sve. Agent vidi samo stranicu Naplata — bez prihoda, profita i podešavanja.
      </p>

      {msg && (
        <div style={{ ...CARD, padding: "12px 16px", fontSize: 13, color: "#18181B", background: "#F4F4F5" }}>
          {msg}
        </div>
      )}

      {/* Invite */}
      <div style={CARD}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 14 }}>
          Dodaj člana
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={LABEL}>Email</label>
            <input style={INPUT} placeholder="ime@firma.com" type="email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label style={LABEL}>Ime (opciono)</label>
            <input style={INPUT} placeholder="Marko Marković"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label style={LABEL}>Rola</label>
            <select style={{ ...INPUT, padding: "8px" }}
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="agent">Agent</option>
              <option value="owner">Vlasnik</option>
            </select>
          </div>
          <button style={btn(true)} disabled={busy || !form.email} onClick={invite}>Dodaj</button>
        </div>
      </div>

      {/* Members */}
      <div style={CARD}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 6 }}>
          Članovi ({members.length})
        </span>
        {members.map((m) => (
          <div key={m.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "12px 0", borderTop: "1px solid #F4F4F5",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
                {m.name || m.email}
                {!m.is_active && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "#DC2626" }}>
                    deaktiviran
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#A1A1AA" }}>
                {m.email}
                {" · "}
                {m.clerk_user_id ? "aktivan nalog" : "čeka prvi login"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <select
                style={{ ...INPUT, width: "auto", padding: "6px 8px", fontSize: 12 }}
                value={m.role}
                onChange={(e) => patch(m.id, { role: e.target.value })}
              >
                <option value="agent">Agent</option>
                <option value="owner">Vlasnik</option>
              </select>
              <button style={btn()} onClick={() => patch(m.id, { is_active: !m.is_active })}>
                {m.is_active ? "Deaktiviraj" : "Aktiviraj"}
              </button>
              <button style={btn()} onClick={() => remove(m.id, m.email)}>Ukloni</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
