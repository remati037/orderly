"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneIcon, MailIcon, CheckIcon, RotateCcwIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";

interface ProcessingOrder {
  id: string;
  order_number: string | null;
  total: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string | null;
  site_name: string | null;
  site_color: string;
  created_at: string;
  called_at: string | null;
}

const CARD: React.CSSProperties = {
  background: "#fff", border: "1px solid #E4E4E7", borderRadius: 10,
  padding: "11px 12px", marginBottom: 8,
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function contactBtn(color: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
    padding: "8px 10px", borderRadius: 7, border: "1px solid #E4E4E7", color,
    textDecoration: "none", background: "#fff",
  };
}

export default function ProcessingCallsList() {
  const [orders, setOrders] = useState<ProcessingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/processing-calls");
    if (res.ok) setOrders((await res.json()).orders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleCalled(order: ProcessingOrder) {
    // Optimistic — this is just a checklist, not worth a full reload round-trip.
    setOrders((prev) => prev.map((o) =>
      o.id === order.id ? { ...o, called_at: o.called_at ? null : new Date().toISOString() } : o
    ));
    if (order.called_at) {
      await fetch(`/api/processing-calls?order_id=${order.id}`, { method: "DELETE" });
    } else {
      await fetch("/api/processing-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id }),
      });
    }
  }

  if (loading) return <p style={{ fontSize: 13, color: "#A1A1AA" }}>Učitavanje…</p>;

  if (orders.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 28, color: "#71717A" }}>
        Nema processing porudžbina u poslednjih 7 dana.
      </div>
    );
  }

  const toCall = orders.filter((o) => !o.called_at);
  const called = orders.filter((o) => o.called_at);

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "#71717A", marginBottom: 12 }}>
        Uspešno naplaćene porudžbine iz poslednjih 7 dana — za pozivanje, ne za naplatu.
        {" "}<strong style={{ color: "#18181B" }}>{toCall.length}</strong> za pozvati
        {called.length > 0 && <>, <strong style={{ color: "#18181B" }}>{called.length}</strong> pozvano</>}.
      </p>

      {[...toCall, ...called].map((o) => (
        <div key={o.id} style={{ ...CARD, display: "flex", alignItems: "center", gap: 12, opacity: o.called_at ? 0.55 : 1 }}>
          <button
            onClick={() => toggleCalled(o)}
            title={o.called_at ? "Označi kao nepozvano" : "Označi kao pozvano"}
            style={{
              flexShrink: 0, width: 26, height: 26, borderRadius: "50%", cursor: "pointer",
              border: o.called_at ? "1px solid #16A34A" : "1px solid #E4E4E7",
              background: o.called_at ? "#16A34A" : "#fff",
              color: o.called_at ? "#fff" : "#D4D4D8",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {o.called_at ? <CheckIcon style={{ width: 14, height: 14 }} /> : <RotateCcwIcon style={{ width: 12, height: 12, opacity: 0 }} />}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
                {o.customer_name || "Nepoznat kupac"}
              </span>
              {o.site_name && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#71717A" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: o.site_color }} />
                  {o.site_name}
                </span>
              )}
              <span style={{ fontSize: 11, color: "#A1A1AA" }}>pre {relativeTime(o.created_at)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
              {formatCurrency(o.total, o.currency)}
              {o.product_name && ` · ${o.product_name}`}
              {o.order_number && ` · #${o.order_number}`}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {o.customer_phone ? (
              <a href={`tel:${o.customer_phone}`} style={contactBtn("#16A34A")}>
                <PhoneIcon style={{ width: 13, height: 13 }} /> {o.customer_phone}
              </a>
            ) : (
              <span style={{ ...contactBtn("#D4D4D8"), cursor: "default" }}>
                <PhoneIcon style={{ width: 13, height: 13 }} /> Nema telefona
              </span>
            )}
            {o.customer_email && (
              <a href={`mailto:${o.customer_email}`} style={contactBtn("#52525B")} title={o.customer_email}>
                <MailIcon style={{ width: 13, height: 13 }} />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
