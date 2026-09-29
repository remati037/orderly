"use client";

import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/utils/currency";

// Shared pieces for the Analytics charts: card shell, legend, tooltip and
// number formatting. Text always uses neutral ink — series colour only ever
// appears on marks and swatches.

export const INK = { primary: "#18181B", secondary: "#52525B", muted: "#A1A1AA", grid: "#F4F4F5", border: "#E4E4E7" };

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{ background: "#fff", border: `1px solid ${INK.border}`, borderRadius: 12, padding: "18px 20px", minWidth: 0 }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: INK.primary, margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: INK.muted, margin: "3px 0 0" }}>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", listStyle: "none", padding: 0, margin: "0 0 10px" }}>
      {items.map((i) => (
        <li key={i.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: INK.secondary }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: "inline-flex", border: `1px solid ${INK.border}`, borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              fontSize: 12, fontWeight: active ? 600 : 500, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
              background: active ? "#DCFCE7" : "transparent", color: active ? "#15803D" : "#71717A",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TooltipRow { key: string; label: string; value: string; color?: string }

export function TooltipBox({ title, rows, footer }: { title: string; rows: TooltipRow[]; footer?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${INK.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", minWidth: 160 }}>
      <p style={{ margin: "0 0 6px", fontWeight: 600, color: INK.primary }}>{title}</p>
      {rows.map((r) => (
        <p key={r.key} style={{ margin: "3px 0", display: "flex", alignItems: "center", gap: 6, color: INK.secondary }}>
          {r.color && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />}
          <span style={{ flex: 1 }}>{r.label}</span>
          <span style={{ fontWeight: 600, color: INK.primary, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
        </p>
      ))}
      {footer && <p style={{ margin: "6px 0 0", paddingTop: 6, borderTop: `1px solid ${INK.grid}`, color: INK.primary, fontWeight: 600 }}>{footer}</p>}
    </div>
  );
}

export const money = (v: number, currency: string) => formatCurrency(v, currency);

// Axis ticks: €0 / €2k / €12.5k
export function compactMoney(v: number, currency: string): string {
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  const suffix = sym ? "" : ` ${currency}`;
  const abs = Math.abs(v);
  const body = abs >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : abs >= 1_000 ? `${+(v / 1_000).toFixed(1)}k` : `${Math.round(v)}`;
  return `${sym}${body}${suffix}`;
}

const monthFmt = new Intl.DateTimeFormat("sr-Latn-RS", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthLongFmt = new Intl.DateTimeFormat("sr-Latn-RS", { month: "long", year: "numeric", timeZone: "UTC" });

// "2026-09" → "sep 26" / "septembar 2026."
export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return (long ? monthLongFmt : monthFmt).format(d).replace(/\.$/, "");
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits).replace(".", ",")}%`;

export const AXIS_TICK = { fontSize: 11, fill: INK.muted };
