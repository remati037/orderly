"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils/currency";

// ── types ──────────────────────────────────────────────────────────────────────

type SmsStatus = "pending_approval" | "approved" | "sending" | "sent" | "failed" | "cancelled";

export interface SmsMessage {
  id: string;
  task_id: string;
  step: number;
  to_number: string;
  body: string;
  status: SmsStatus;
  due_at: string;
  sent_at?: string | null;
  error?: string | null;
  cancel_reason?: string | null;
  task?: {
    order?: {
      woo_order_id: string | null;
      total: number;
      currency: string;
      customer_name: string | null;
      sites?: { name: string } | null;
    } | null;
  } | null;
}

const STATUS_LABEL: Record<SmsStatus, { text: string; color: string; bg: string }> = {
  pending_approval: { text: "Čeka odobrenje", color: "#B45309", bg: "#FEF3C7" },
  approved:         { text: "Odobreno",       color: "#1D4ED8", bg: "#DBEAFE" },
  sending:          { text: "Šalje se…",      color: "#1D4ED8", bg: "#DBEAFE" },
  sent:             { text: "Poslato",        color: "#15803D", bg: "#DCFCE7" },
  failed:           { text: "Greška",         color: "#B91C1C", bg: "#FEE2E2" },
  cancelled:        { text: "Otkazano",       color: "#71717A", bg: "#F4F4F5" },
};

function dueLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "spremno";
  const h = Math.round(ms / 3_600_000);
  return h < 1 ? "za manje od sat" : h < 48 ? `za ${h} h` : `za ${Math.round(h / 24)} dana`;
}

// 160 chars/segment in plain GSM-7, 70 as soon as one character falls outside it.
function segments(text: string): number {
  const gsm = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
  const [single, multi] = gsm.test(text) ? [160, 153] : [70, 67];
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

async function call(method: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/sms", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    alert(j?.error ?? "Radnja nije uspela");
    return false;
  }
  return true;
}

const BTN: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 7,
  border: "1px solid #E4E4E7", background: "#fff", color: "#3F3F46", cursor: "pointer",
};

// ── one reminder ───────────────────────────────────────────────────────────────

export function SmsRow({ m, onChanged }: { m: SmsMessage; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.body);
  const [busy, setBusy] = useState(false);
  const st = STATUS_LABEL[m.status];
  const order = m.task?.order;

  async function act(action: "approve" | "cancel" | "edit") {
    setBusy(true);
    const ok = await call("PATCH", { id: m.id, action, body: action === "edit" ? text : undefined });
    setBusy(false);
    if (ok) {
      setEditing(false);
      onChanged();
    }
  }

  return (
    <div style={{ border: "1px solid #E4E4E7", borderRadius: 9, padding: "10px 12px", marginBottom: 8, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#52525B" }}>Podsetnik {m.step}/3</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: st.bg, color: st.color }}>
          {st.text}
        </span>
        {(m.status === "pending_approval" || m.status === "approved") && (
          <span style={{ fontSize: 11, color: "#A1A1AA" }}>šalje se {dueLabel(m.due_at)} · samo 08–21h</span>
        )}
        <span style={{ fontSize: 11, color: "#A1A1AA", marginLeft: "auto" }}>{m.to_number}</span>
      </div>

      {order && (
        <div style={{ fontSize: 12, color: "#71717A", marginBottom: 6 }}>
          {order.customer_name || "—"} · #{order.woo_order_id} · {formatCurrency(order.total, order.currency)}
          {order.sites?.name && ` · ${order.sites.name}`}
        </div>
      )}

      {editing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ width: "100%", minHeight: 70, fontSize: 13, padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 7, resize: "vertical" }}
          />
          <div style={{ fontSize: 11, color: text.length > 480 ? "#DC2626" : "#A1A1AA", margin: "3px 0 6px" }}>
            {text.length}/480 znakova · {segments(text)} SMS
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#18181B", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
      )}

      {m.status === "failed" && m.error && (
        <div style={{ fontSize: 11.5, color: "#B91C1C", marginTop: 6 }}>{m.error}</div>
      )}
      {m.status === "sending" && (
        <div style={{ fontSize: 11.5, color: "#71717A", marginTop: 6 }}>
          Preuzeto od gateway-a. Ako ovo stoji duže od par minuta, proveri da li gateway radi.
        </div>
      )}

      {(m.status === "pending_approval" || m.status === "approved") && (
        <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
          {m.status === "pending_approval" && !editing && (
            <button disabled={busy} onClick={() => act("approve")}
              style={{ ...BTN, background: "#16A34A", borderColor: "#16A34A", color: "#fff" }}>
              Odobri slanje
            </button>
          )}
          {editing ? (
            <>
              <button disabled={busy || !text.trim() || text.length > 480} onClick={() => act("edit")} style={BTN}>Sačuvaj tekst</button>
              <button disabled={busy} onClick={() => { setEditing(false); setText(m.body); }} style={BTN}>Odustani</button>
            </>
          ) : (
            m.status === "pending_approval" && <button disabled={busy} onClick={() => setEditing(true)} style={BTN}>Izmeni</button>
          )}
          {!editing && (
            <button disabled={busy} onClick={() => act("cancel")} style={{ ...BTN, color: "#B91C1C" }}>Otkaži</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── inside the task drawer ─────────────────────────────────────────────────────

export function TaskSms({ taskIds, onChanged }: { taskIds: string[]; onChanged: () => void }) {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const key = taskIds.join(",");

  const load = useCallback(async () => {
    const res = await fetch(`/api/sms?taskId=${key}`);
    if (res.ok) setMessages((await res.json()).messages ?? []);
  }, [key]);

  useEffect(() => { load(); }, [load]);

  if (messages.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 8 }}>
        SMS podsetnici
      </span>
      {messages.map((m) => (
        <SmsRow key={m.id} m={m} onChanged={() => { load(); onChanged(); }} />
      ))}
    </div>
  );
}

// ── the approval queue (own tab) ───────────────────────────────────────────────

export function SmsQueue({ onChanged }: { onChanged?: () => void }) {
  const [messages, setMessages] = useState<SmsMessage[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sms?queue=1");
    if (res.ok) setMessages((await res.json()).messages ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!messages) return <p style={{ fontSize: 13, color: "#A1A1AA" }}>Učitavam…</p>;

  const due = messages.filter((m) => m.status === "pending_approval" && new Date(m.due_at) <= new Date());
  const rest = messages.filter((m) => !due.includes(m));

  const section = (title: string, rows: SmsMessage[]) =>
    rows.length > 0 && (
      <div style={{ marginBottom: 22 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#18181B", display: "block", marginBottom: 8 }}>
          {title} ({rows.length})
        </span>
        {rows.map((m) => (
          <SmsRow key={m.id} m={m} onChanged={() => { load(); onChanged?.(); }} />
        ))}
      </div>
    );

  return (
    <div style={{ maxWidth: 720 }}>
      {messages.length === 0 && (
        <p style={{ fontSize: 13, color: "#A1A1AA" }}>
          Nema SMS poruka u redu. Pojavljuju se čim se otvori novi zadatak za naplatu.
        </p>
      )}
      {section("Spremno za odobrenje", due)}
      {section("Zakazano / u toku", rest)}
    </div>
  );
}

// ── owner settings ─────────────────────────────────────────────────────────────

interface Config {
  enabled: boolean;
  enabled_from: string | null;
  statuses: string[];
  templates: Record<string, string>;
}

const STATUS_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "failed",         label: "Neuspelo plaćanje (failed)",   hint: "Kartica odbijena ili greška u naplati" },
  { value: "pending",        label: "Plaćanje započeto (pending)",  hint: "Kupac je krenuo da plati, ali nije završio" },
  { value: "on-hold",        label: "Čeka uplatu (on-hold)",        hint: "Obično bankovni transfer — poruka sa linkom za karticu možda nije prava" },
  { value: "checkout-draft", label: "Napuštena korpa",              hint: "Marketing — traži pristanak kupca" },
];

export function SmsSettings() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/sms/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCfg(j?.config ?? null));
  }, []);

  async function save(patch: Partial<Config>) {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/sms/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (res.ok) {
      setCfg(j.config);
      setMsg("Sačuvano");
    } else {
      setMsg(j?.error ?? "Greška");
    }
  }

  if (!cfg) {
    return <p style={{ fontSize: 13, color: "#A1A1AA" }}>SMS podešavanja nisu dostupna (migracija 020 još nije primenjena?).</p>;
  }

  return (
    <div style={{ maxWidth: 720, borderTop: "1px solid #F4F4F5", paddingTop: 18, marginTop: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 10 }}>Podešavanja (vlasnik)</span>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 4 }}>
        <input type="checkbox" checked={cfg.enabled} disabled={saving}
          onChange={(e) => save({ enabled: e.target.checked })} />
        <strong>Pravi SMS podsetnike za nove zadatke naplate</strong>
      </label>
      <p style={{ fontSize: 11.5, color: "#A1A1AA", margin: "0 0 14px 24px" }}>
        {cfg.enabled && cfg.enabled_from
          ? `Aktivno od ${new Date(cfg.enabled_from).toLocaleString("sr-RS")}. Stari zadaci ne dobijaju SMS. `
          : "Isključeno. Kad uključiš, važi samo za zadatke koji se otvore posle toga. "}
        Ništa se ne šalje dok ga ti ručno ne odobriš.
      </p>

      <span style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Za koje statuse</span>
      {STATUS_OPTIONS.map((o) => (
        <label key={o.value} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 6 }}>
          <input type="checkbox" checked={cfg.statuses.includes(o.value)} disabled={saving}
            onChange={(e) => {
              const next = e.target.checked ? [...cfg.statuses, o.value] : cfg.statuses.filter((s) => s !== o.value);
              if (next.length) save({ statuses: next });
            }} />
          <span>{o.label}<br /><span style={{ fontSize: 11.5, color: "#A1A1AA" }}>{o.hint}</span></span>
        </label>
      ))}

      <span style={{ fontSize: 12, fontWeight: 600, display: "block", margin: "14px 0 6px" }}>Tekstovi</span>
      <p style={{ fontSize: 11.5, color: "#A1A1AA", margin: "0 0 8px" }}>
        Mogu se koristiti: {"{ime} {broj} {iznos} {link} {sajt}"}. Slova č, ć, š, ž, đ se pri slanju zamene sa c, c, s, z, d
        da poruka ostane kratka (160 znakova po SMS-u).
      </p>
      {["1", "2", "3"].map((k) => (
        <TemplateField key={`${k}:${cfg.templates[k] ?? ""}`} label={k === "1" ? "Odmah" : k === "2" ? "Posle 24 h" : "Posle 72 h"}
          value={cfg.templates[k] ?? ""} disabled={saving}
          onSave={(v) => save({ templates: { ...cfg.templates, [k]: v } })} />
      ))}
      {msg && <p style={{ fontSize: 12, color: msg === "Sačuvano" ? "#15803D" : "#B91C1C" }}>{msg}</p>}
    </div>
  );
}

function TemplateField({ label, value, disabled, onSave }: {
  label: string; value: string; disabled: boolean; onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#71717A", textTransform: "uppercase" }}>{label}</span>
      <textarea value={v} onChange={(e) => setV(e.target.value)}
        style={{ width: "100%", minHeight: 58, fontSize: 13, padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 7, resize: "vertical" }} />
      {v !== value && (
        <button disabled={disabled || !v.trim()} onClick={() => onSave(v)} style={{ ...BTN, marginTop: 4 }}>Sačuvaj</button>
      )}
    </div>
  );
}
