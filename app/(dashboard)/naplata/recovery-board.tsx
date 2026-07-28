"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneIcon, MailIcon, XIcon, BellIcon, CheckCircle2Icon, CopyIcon, CheckIcon, SearchIcon, TimerIcon } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils/currency";
import { supabaseBrowser } from "@/lib/supabase/browser-client";
import { SubscriptionDots } from "@/components/dashboard/subscription-dots";

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
  reason: string;
  total: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string | null;
  site_name: string | null;
  site_color: string;
  order_created_at: string | null;
  age_days: number;
  wait_ms: number;
  wait_frozen: boolean;
  resolved_elsewhere: boolean;
  subscription_seq: number | null;
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

// Order statuses that open a recovery card (mirrors the DB trigger in
// 009_recovery_pipeline.sql) — used to recognize "a new card just appeared".
const NOTIFY_ORDER_STATUSES = new Set(["on-hold", "failed", "pending", "checkout-draft"]);

function formatWait(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const totalH = Math.floor(totalMin / 60);
  if (totalH < 24) return `${totalH}h ${totalMin % 60}m`;
  const days = Math.floor(totalH / 24);
  return `${days}d ${totalH % 24}h`;
}

// Still ticking (no contact yet): escalates with urgency. Frozen (already
// contacted): neutral blue — it's a record, not something to act on.
function waitColor(ms: number, frozen: boolean): string {
  if (frozen) return "#2563EB";
  const hours = ms / 3_600_000;
  if (hours >= 4) return "#DC2626";
  if (hours >= 1) return "#D97706";
  return "#A1A1AA";
}

// Buckets tasks by the Belgrade calendar day the underlying order appeared,
// and how many of that day's cards have since been contacted (wait_frozen).
// Computed client-side from the already-loaded board — no extra API call.
interface DayStat { day: string; label: string; total: number; contacted: number; pct: number }

function buildDailyStats(tasks: Task[], daysToShow: number): DayStat[] {
  const byDay = new Map<string, { total: number; contacted: number }>();
  for (const t of tasks) {
    if (!t.order_created_at) continue;
    const day = new Date(t.order_created_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Belgrade" });
    const entry = byDay.get(day) ?? { total: 0, contacted: 0 };
    entry.total += 1;
    if (t.wait_frozen) entry.contacted += 1;
    byDay.set(day, entry);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-daysToShow)
    .map(([day, { total, contacted }]) => ({
      day,
      label: day.slice(5).split("-").reverse().join("."), // "07-28" -> "28.07"
      total,
      contacted,
      pct: total > 0 ? Math.round((contacted / total) * 1000) / 10 : 0,
    }));
}

function DailyContactChart({ data }: { data: DayStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#F4F4F5" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="count" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false}
          domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => {
            if (name === "% kontaktirano") return [`${value}%`, name];
            return [value, name];
          }}
        />
        <Bar yAxisId="count" dataKey="total" name="Ukupno" fill="#E4E4E7" radius={[3, 3, 0, 0]} barSize={14} />
        <Bar yAxisId="count" dataKey="contacted" name="Kontaktirano" fill="#16A34A" radius={[3, 3, 0, 0]} barSize={14} />
        <Line yAxisId="pct" dataKey="pct" name="% kontaktirano" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  failed:           { label: "Failed",   bg: "#FEF2F2", color: "#DC2626" },
  "on-hold":        { label: "On hold",  bg: "#FFF7ED", color: "#C2410C" },
  pending:          { label: "Pending",  bg: "#EEF2FF", color: "#4338CA" },
  "checkout-draft": { label: "Napušteno", bg: "#F4F4F5", color: "#52525B" },
};

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "#F4F4F5", color: "#52525B" };
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 99,
      background: m.bg, color: m.color, whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

// ── board ──────────────────────────────────────────────────────────────────────

export default function RecoveryBoard({ currentMemberId }: { currentMemberId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission | "unsupported">("default");
  const [search, setSearch] = useState("");

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

  // Read current browser permission once on mount.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    setNotifPermission(Notification.permission);
  }, []);

  function requestNotifPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Notification.requestPermission().then(setNotifPermission);
  }

  // Dedicated Realtime subscription for this board — deliberately separate from
  // the shared orders channel (used by TV/Live Feed), which skips `failed`
  // inserts on purpose. Naplata needs exactly those.
  useEffect(() => {
    const channel = supabaseBrowser
      .channel("naplata-new-cards")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as {
            status?: string;
            customer_name?: string | null;
            total?: number;
            currency?: string;
          };
          if (!row.status || !NOTIFY_ORDER_STATUSES.has(row.status)) return;

          load();

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("Nova kartica za naplatu", {
              body: `${row.customer_name || "Nepoznat kupac"} — ${formatCurrency(row.total ?? 0, row.currency ?? "RSD")}`,
            });
          }
        }
      )
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, [load]);

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

  const q = search.trim().toLowerCase();
  const filteredTasks = !q ? tasks : tasks.filter((t) =>
    [t.customer_name, t.customer_email, t.customer_phone, t.product_name, t.order_number]
      .some((field) => field?.toLowerCase().includes(q))
  );

  const contactedTasks = tasks.filter((t) => t.wait_frozen);
  const avgContactMs = contactedTasks.length > 0
    ? contactedTasks.reduce((s, t) => s + t.wait_ms, 0) / contactedTasks.length
    : null;
  const dailyStats = buildDailyStats(tasks, 14);

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

      {tasks.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ ...CARD, cursor: "default", flex: "0 0 200px", padding: "14px 16px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              <TimerIcon style={{ width: 13, height: 13 }} /> Prosek do kontakta
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#18181B" }}>
              {avgContactMs !== null ? formatWait(avgContactMs) : "—"}
            </span>
            <div style={{ fontSize: 11.5, color: "#A1A1AA", marginTop: 2 }}>
              na osnovu {contactedTasks.length} kontaktiranih kartica
            </div>
          </div>

          <div style={{ ...CARD, cursor: "default", flex: "1 1 380px", padding: "14px 16px 6px" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#71717A", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
              Kontaktirano po danu (poslednjih 14 dana)
            </span>
            {dailyStats.length > 0 ? (
              <DailyContactChart data={dailyStats} />
            ) : (
              <p style={{ fontSize: 12.5, color: "#A1A1AA", padding: "16px 0" }}>Nema podataka.</p>
            )}
          </div>
        </div>
      )}

      {notifPermission === "default" && (
        <div style={{
          ...CARD, cursor: "default", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, padding: "10px 14px",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#3F3F46" }}>
            <BellIcon style={{ width: 14, height: 14 }} /> Uključi obaveštenja za nove kartice naplate
          </span>
          <button
            onClick={requestNotifPermission}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7,
              border: "1px solid #16A34A", background: "#16A34A", color: "#fff", cursor: "pointer",
            }}
          >
            Uključi
          </button>
        </div>
      )}

      {tasks.length > 0 && (
        <div style={{ position: "relative", marginBottom: 14, maxWidth: 320 }}>
          <SearchIcon style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            width: 14, height: 14, color: "#A1A1AA", pointerEvents: "none",
          }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po imenu, mejlu, telefonu, proizvodu…"
            style={{
              width: "100%", fontSize: 13, padding: "8px 10px 8px 32px",
              border: "1px solid #E4E4E7", borderRadius: 8, outline: "none",
            }}
          />
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "#A1A1AA" }}>Učitavanje…</p>
      ) : tasks.length === 0 ? (
        <div style={{ ...CARD, cursor: "default", textAlign: "center", padding: 28, color: "#71717A" }}>
          Nema neplaćenih porudžbina. 🎉
        </div>
      ) : filteredTasks.length === 0 ? (
        <div style={{ ...CARD, cursor: "default", textAlign: "center", padding: 28, color: "#71717A" }}>
          Nema kartica koje odgovaraju pretrazi.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
          {COLUMNS.map((col) => {
            const items = filteredTasks.filter((t) => t.stage === col.stage);
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
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, minWidth: 0 }}>
                        <span style={{ fontSize: 11.5, color: "#71717A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.product_name}
                        </span>
                        {t.subscription_seq && <SubscriptionDots seq={t.subscription_seq} />}
                      </div>
                    )}

                    {/* why it's stuck */}
                    <div style={{ marginTop: 7 }}>
                      <StatusPill status={t.order_status} />
                    </div>
                    {t.reason && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "#71717A", lineHeight: 1.35 }}>
                        {t.reason}
                      </div>
                    )}

                    {t.resolved_elsewhere && (
                      <div style={{
                        marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 6,
                        background: "#DCFCE7", color: "#15803D",
                      }}>
                        <CheckCircle2Icon style={{ width: 11, height: 11 }} /> Prošla druga porudžbina — ne zvati
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
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, fontWeight: 600, color: waitColor(t.wait_ms, t.wait_frozen),
                      }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: waitColor(t.wait_ms, t.wait_frozen),
                        }} />
                        {formatWait(t.wait_ms)}{t.wait_frozen ? " (pozvan)" : ""}
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
  const [emailCopied, setEmailCopied] = useState(false);

  function copyEmail() {
    if (!task.customer_email) return;
    navigator.clipboard.writeText(task.customer_email).then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1500);
    });
  }
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

        <div style={{ fontSize: 13, color: "#71717A", marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <span>
            {formatCurrency(task.total, task.currency)}
            {task.product_name && ` · ${task.product_name}`}
            {" · stara "}{task.age_days} dana
            {" · čeka poziv "}{formatWait(task.wait_ms)}{task.wait_frozen ? " (pozvan)" : ""}
          </span>
          {task.subscription_seq && <SubscriptionDots seq={task.subscription_seq} />}
        </div>

        {task.resolved_elsewhere && (
          <div style={{
            background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8,
            padding: "10px 12px", marginBottom: 12,
            display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <CheckCircle2Icon style={{ width: 15, height: 15, color: "#16A34A", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, color: "#15803D", lineHeight: 1.4, fontWeight: 600 }}>
              Kupac je platio drugu porudžbinu istog dana — ne treba zvati.
            </span>
          </div>
        )}

        {/* why it's stuck */}
        <div style={{
          background: "#FAFAFA", border: "1px solid #F4F4F5", borderRadius: 8,
          padding: "10px 12px", marginBottom: 16,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <StatusPill status={task.order_status} />
          <span style={{ fontSize: 12.5, color: "#3F3F46", lineHeight: 1.4 }}>
            {task.reason || "Bez dodatnog objašnjenja."}
          </span>
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
            <>
              <a
                href={`mailto:${task.customer_email}?subject=${mailSubject}&body=${mailBody}`}
                style={{ ...contactBtn("#52525B"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                title={task.customer_email}
              >
                <MailIcon style={{ width: 14, height: 14, flexShrink: 0 }} /> {task.customer_email}
              </a>
              <button
                onClick={copyEmail}
                title="Kopiraj email"
                style={{
                  ...contactBtn(emailCopied ? "#16A34A" : "#52525B"),
                  flexShrink: 0,
                  background: "#fff",
                  cursor: "pointer",
                  padding: "8px 10px",
                }}
              >
                {emailCopied ? <CheckIcon style={{ width: 14, height: 14 }} /> : <CopyIcon style={{ width: 14, height: 14 }} />}
              </button>
            </>
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
