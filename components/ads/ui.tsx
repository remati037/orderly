"use client";

// Pieces /reklame and /reklame/oglasi share: verdict badges, number formats, table cells.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { INK, pct } from "@/components/dashboard/analytics/chart-kit";
import { formatMoney, type Verdict, type VerdictLevel } from "@/lib/ads/report";

export const VERDICT: Record<VerdictLevel, { label: string; color: string; bg: string }> = {
  good: { label: "Dobro", color: "var(--tone-green-strong)", bg: "var(--tone-green-2)" },
  watch: { label: "Pazi", color: "var(--tone-amber-deep)", bg: "var(--tone-amber-2)" },
  bad: { label: "Loše", color: "var(--tone-red-strong)", bg: "var(--tone-red-2)" },
  low_data: { label: "Rano za ocenu", color: INK.secondary, bg: INK.grid },
  lead: { label: "Leadovi", color: "var(--tone-blue-strong)", bg: "var(--tone-blue-2)" },
  idle: { label: "Bez potrošnje", color: INK.secondary, bg: INK.grid },
};

export const money = (v: number | null, cur: string, digits = 2) => (v === null ? "—" : formatMoney(v, cur, digits));
export const times = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);
export const count = (v: number) => v.toLocaleString("de-DE");
export const percent = (v: number | null) => (v === null ? "—" : pct(v, 2));

export const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export const th: React.CSSProperties = {
  padding: "8px 10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
  color: INK.muted, textAlign: "right", whiteSpace: "nowrap",
};
export const td: React.CSSProperties = { padding: "10px", fontSize: 13, color: INK.primary, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

export function VerdictBadge({ verdict, withReason }: { verdict: Verdict; withReason?: boolean }) {
  const v = VERDICT[verdict.level];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: v.color, background: v.bg, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{v.label}</span>
      {withReason && <span style={{ fontSize: 13, color: INK.secondary }}>{verdict.reason}</span>}
    </span>
  );
}


const TABS = [
  { href: "/reklame", label: "Pregled naloga" },
  { href: "/reklame/oglasi", label: "Svi oglasi" },
];

export function ReklameTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Reklame" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${INK.border}`, marginBottom: 20, overflowX: "auto" }}>
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            style={{ padding: "8px 12px", fontSize: 13, fontWeight: active ? 600 : 500, color: active ? INK.primary : INK.secondary, borderBottom: `2px solid ${active ? "var(--tone-green-strong)" : "transparent"}`, marginBottom: -1, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
