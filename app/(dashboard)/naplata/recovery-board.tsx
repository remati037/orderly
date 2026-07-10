"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneIcon, MailIcon, XIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";

// ── types ──────────────────────────────────────────────────────────────────────

type Stage = "novo" | "kontaktiran" | "ceka_uplatu" | "naplaceno" | "otkazano";

interface Task {
  id: string;
  stage: Stage;
  assigned_to: string | null;
  attempts: number;
  last_contacted_at: string | null;
  order_id: string;
  order_number: string | null;
  order_status: string;
  total: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string | null;
  site_name: string | null;
  site_color: string;
  age_days: number;
}

interface Member { id: string; email: string; name: string | null }

interface Note {
  id: string;
  channel: "telefon" | "email" | "napomena";
  body: string;
  created_at: string;
  author?: { email: string; name: string | null } | null;
}

// ── constants ──────────────────────────────────────────────────────────────────

const COLUMNS: { stage: Stage; label: string; accent: string }[] = [
  { stage: "novo",        label: "Novo",        accent: "#A1A1AA" },
  { stage: "kontaktiran", label: "Kontaktiran", accent: "#D97706" },
  { stage: "ceka_uplatu", label: "Čeka uplatu", accent: "#1B6EF3" },
  { stage: "naplaceno",   label: "Naplaćeno",   accent: "#16A34A" },
  { stage: "otkazano",    label: "Otkazano",    accent: "#DC2626" },
];

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E4E4E7",
  borderRadius: 10,
  padding: "11px 12px",
  marginBottom: 8,
  cursor: "pointer",
};

// A card older than a week without contact is the thing worth chasing.
function ageColor(days: number): string {
  if (days >= 7) return "#DC2626";
  if (days >= 3) return "#D97706";
  return "#A1A1AA";
}

// ── board ──────────────────────────────────────────────────────────────────────

export default function RecoveryBoard({ currentMemberId }: { currentMemberId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/recovery");
    if (res.ok) {
      const json = await res.json();
      setTasks(json.tasks ?? []);
      setMembers(json.members ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...body } as Task : t)));
    await fetch("/api/recovery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    load();
  }

  const openTotal = tasks
    .filter((t) => t.stage !== "naplaceno" && t.stage !== "otkazano")
    .reduce((s, t) => s + t.total, 0);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#18181B", marginBottom: 4 }}>
        Naplata
      </h1>
      <p style={{ fontSize: 13, color: "#71717A", marginBottom: 18 }}>
        Porudžbine koje nisu plaćene. Kontaktiraj kupca i pomeri karticu kroz faze.
        {openTotal > 0 && (
          <>
            {" "}Otvoreno: <strong style={{ color: "#18181B" }}>
              {formatCurrency(openTotal, tasks[0]?.currency ?? "EUR")}
            </strong>
          </>
        )}
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: "#A1A1AA" }}>Učitavanje…</p>
      ) : tasks.length === 0 ? (
        <div style={{ ...CARD, cursor: "default", textAlign: "center", padding: 28, color: "#71717A" }}>
          Nema neplaćenih porudžbina. 🎉
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.stage === col.stage);
            return (
              <div key={col.stage} style={{ flex: "1 0 240px", minWidth: 240 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, padding: "0 2px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: col.accent }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#18181B" }}>{col.label}</span>
                  <span style={{ fontSize: 11.5, color: "#A1A1AA" }}>{items.length}</span>
                </div>

                {items.map((t) => (
                  <div key={t.id} style={CARD} onClick={() => setOpen(t)}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
                        {t.customer_name || "Nepoznat kupac"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#18181B", whiteSpace: "nowrap" }}>
                        {formatCurrency(t.total, t.currency)}
                      </span>
                    </div>

                    {t.product_name && (
                      <div style={{ fontSize: 11.5, color: "#71717A", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.product_name}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {t.site_name && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#71717A" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.site_color }} />
                          {t.site_name}
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, color: ageColor(t.age_days) }}>
                        {t.age_days}d
                      </span>
                      {t.attempts > 0 && (
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{t.attempts}× kontakt</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <TaskDrawer
          task={tasks.find((t) => t.id === open.id) ?? open}
          members={members}
          currentMemberId={currentMemberId}
          onClose={() => setOpen(null)}
          onPatch={patch}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ── drawer ─────────────────────────────────────────────────────────────────────

function TaskDrawer({
  task, members, currentMemberId, onClose, onPatch, onChanged,
}: {
  task: Task;
  members: Member[];
  currentMemberId: string;
  onClose: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<Note["channel"]>("telefon");
  const [busy, setBusy] = useState(false);

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/recovery/notes?taskId=${task.id}`);
    if (res.ok) setNotes((await res.json()).notes ?? []);
  }, [task.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  async function addNote() {
    if (!body.trim()) return;
    setBusy(true);
    await fetch("/api/recovery/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: task.id, channel, body }),
    });
    setBody("");
    setBusy(false);
    await Promise.all([loadNotes(), onChanged()]);
  }

  const mailBody = encodeURIComponent(
    `Poštovani ${task.customer_name ?? ""},\n\n` +
    `Primetili smo da Vaša porudžbina${task.product_name ? ` (${task.product_name})` : ""} ` +
    `u iznosu od ${formatCurrency(task.total, task.currency)} nije uspešno plaćena.\n\n` +
    `Ako Vam je potrebna pomoć oko uplate, javite nam se.\n\nHvala!`
  );
  const mailSubject = encodeURIComponent(
    `Vaša porudžbina${task.order_number ? ` #${task.order_number}` : ""}`
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
        display: "flex", justifyContent: "flex-end", zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: "100%", background: "#fff", height: "100%",
          overflowY: "auto", padding: "20px 22px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#18181B" }}>
            {task.customer_name || "Nepoznat kupac"}
          </h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#A1A1AA" }}>
            <XIcon style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ fontSize: 13, color: "#71717A", marginBottom: 16 }}>
          {formatCurrency(task.total, task.currency)}
          {task.product_name && ` · ${task.product_name}`}
          <br />
          Status: <code style={{ fontSize: 12 }}>{task.order_status}</code> · stara {task.age_days} dana
        </div>

        {/* contact */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {task.customer_phone ? (
            <a href={`tel:${task.customer_phone}`} style={contactBtn("#16A34A")}>
              <PhoneIcon style={{ width: 14, height: 14 }} /> {task.customer_phone}
            </a>
          ) : (
            <span style={{ ...contactBtn("#E4E4E7"), color: "#A1A1AA", cursor: "default" }}>
              <PhoneIcon style={{ width: 14, height: 14 }} /> Nema telefona
            </span>
          )}
          {task.customer_email && (
            <a
              href={`mailto:${task.customer_email}?subject=${mailSubject}&body=${mailBody}`}
              style={contactBtn("#52525B")}
            >
              <MailIcon style={{ width: 14, height: 14 }} /> Email
            </a>
          )}
        </div>

        {/* stage + assignee */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <div>
            <label style={LABEL}>Faza</label>
            <select style={INPUT} value={task.stage}
              onChange={(e) => onPatch(task.id, { stage: e.target.value })}>
              {COLUMNS.map((c) => <option key={c.stage} value={c.stage}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Zadužen</label>
            <select style={INPUT} value={task.assigned_to ?? ""}
              onChange={(e) => onPatch(task.id, { assigned_to: e.target.value || null })}>
              <option value="">— niko —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}{m.id === currentMemberId ? " (ja)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* add note */}
        <label style={LABEL}>Zabeleži kontakt</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["telefon", "email", "napomena"] as const).map((c) => (
            <button key={c} onClick={() => setChannel(c)} style={{
              fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 6,
              border: "1px solid", cursor: "pointer",
              background: channel === c ? "#DCFCE7" : "#fff",
              borderColor: channel === c ? "#16A34A" : "#E4E4E7",
              color: channel === c ? "#15803D" : "#71717A",
            }}>
              {c === "telefon" ? "Telefon" : c === "email" ? "Email" : "Napomena"}
            </button>
          ))}
        </div>
        <textarea
          style={{ ...INPUT, minHeight: 66, resize: "vertical", marginBottom: 8 }}
          placeholder="Šta se desilo u razgovoru?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          onClick={addNote}
          disabled={busy || !body.trim()}
          style={{
            fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 7,
            border: "1px solid #16A34A", background: "#16A34A", color: "#fff",
            cursor: busy || !body.trim() ? "default" : "pointer", opacity: !body.trim() ? 0.5 : 1,
            marginBottom: 20,
          }}
        >
          Sačuvaj
        </button>

        {/* history */}
        <span style={{ fontSize: 12, fontWeight: 600, color: "#18181B", display: "block", marginBottom: 8 }}>
          Istorija ({notes.length})
        </span>
        {notes.length === 0 && <p style={{ fontSize: 12.5, color: "#A1A1AA" }}>Još nema beleški.</p>}
        {notes.map((n) => (
          <div key={n.id} style={{ borderTop: "1px solid #F4F4F5", padding: "9px 0" }}>
            <div style={{ fontSize: 11, color: "#A1A1AA", marginBottom: 2 }}>
              {n.channel} · {new Date(n.created_at).toLocaleString("sr-RS")}
              {n.author && ` · ${n.author.name || n.author.email}`}
            </div>
            <div style={{ fontSize: 12.5, color: "#3F3F46", whiteSpace: "pre-wrap" }}>{n.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────

function contactBtn(color: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12.5, fontWeight: 600, padding: "8px 12px", borderRadius: 7,
    border: `1px solid ${color}`, color, textDecoration: "none",
  };
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#71717A",
  textTransform: "uppercase", letterSpacing: "0.04em",
  display: "block", marginBottom: 4,
};

const INPUT: React.CSSProperties = {
  width: "100%", fontSize: 13, padding: "8px 10px",
  border: "1px solid #E4E4E7", borderRadius: 7, outline: "none",
};
