"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { ChevronRightIcon } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { chartColor } from "@/lib/utils/chart-color";
import { LoadError } from "@/components/dashboard/load-error";
import { ChartCard, INK, TooltipBox, compactMoney, pct } from "@/components/dashboard/analytics/chart-kit";

interface Tier { from: number; amount: number; rate: number; per_person: number }
interface BonusResult { tierIndex: number; rate: number; total: number; perPerson: number }
interface ProductRow { name: string; revenue: number; counted: number; units: number; goal: number | null }
interface SiteRow { site_id: string; name: string; color: string; share: number; revenue: number; counted: number; orders: number; products: ProductRow[] }
interface Day { date: string; counted: number; cumulative: number | null }

interface BonusData {
  name: string;
  from: string;
  to: string;
  people: number;
  can_edit: boolean;
  base_currency: string;
  revenue: number;
  counted: number;
  bonus: BonusResult;
  projected: { counted: number; bonus: BonusResult } | null;
  elapsed_days: number;
  total_days: number;
  tiers: Tier[];
  sites: SiteRow[];
  days: Day[];
}

const GREEN = "var(--tone-green)";

// Whole euros: bonus figures are discussed in round numbers.
const eur = (v: number, cur: string) =>
  cur === "EUR" ? `${Math.round(v).toLocaleString("de-DE")} €` : `${Math.round(v).toLocaleString("de-DE")} ${cur}`;

// Round 50k steps (100k, 150k, 200k) are the headline tiers, bold in the table.
const isHeadline = (t: Tier, i: number) => i > 0 && t.from % 50_000 === 0;

const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

const th: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
  color: INK.muted, textAlign: "right", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: INK.primary, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "var(--ui-surface)", border: `1px solid ${INK.border}`, borderRadius: 12, padding: "16px 18px", minWidth: 0 }}>
      <p style={{ fontSize: 12, color: INK.muted, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: INK.primary, margin: "6px 0 0", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {hint && <p style={{ fontSize: 12, color: INK.secondary, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

// Progress across the tier ladder: bar from 0 to the last tier, ticks at the
// tiers, plus how much is still missing to the next tier.
function Progress({ data }: { data: BonusData }) {
  const cur = data.base_currency;
  const max = data.tiers[data.tiers.length - 1]?.from ?? 1;
  const next = data.tiers[data.bonus.tierIndex + 1];
  const fill = Math.min(1, Math.max(0, data.counted / max));
  const milestones = data.tiers;

  return (
    <ChartCard
      title="Napredak do sledećeg praga"
      subtitle={next
        ? <>Još <strong style={{ color: INK.primary }}>{eur(next.from - data.counted, cur)}</strong> do {eur(next.from, cur)} → bonus {eur(next.amount, cur)} ({eur(next.per_person, cur)} po osobi)</>
        : "Dostignut najviši prag"}
    >
      <div style={{ position: "relative", padding: "4px 0 26px" }}>
        <div style={{ height: 14, background: INK.grid, borderRadius: 7, overflow: "hidden" }}>
          <div style={{ width: `${fill * 100}%`, height: "100%", background: GREEN, borderRadius: 7, transition: "width 300ms" }} />
        </div>
        {milestones.map((t) => (
          <div key={t.from} style={{ position: "absolute", left: `${(t.from / max) * 100}%`, top: 0, transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ width: 2, height: 22, background: data.counted >= t.from ? "#15803D" : "var(--ui-border-strong)", margin: "0 auto" }} />
            <div style={{ fontSize: 11, color: INK.secondary, whiteSpace: "nowrap" }}>{compactMoney(t.from, cur)}</div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function CumulativeChart({ data }: { data: BonusData }) {
  const cur = data.base_currency;
  const max = data.tiers[data.tiers.length - 1]?.from ?? 0;
  const top = Math.max(max, ...data.days.map((d) => d.cumulative ?? 0)) * 1.05;
  const milestones = data.tiers;

  return (
    <ChartCard title="Obračunski promet kroz mesec" subtitle="Zbirno po danima · partnerski sajtovi sa 50%">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data.days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} interval={Math.floor((data.days.length - 1) / 6)} />
          <YAxis domain={[0, top]} tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(v, cur)} width={52} />
          {milestones.map((t, i) => (
            <ReferenceLine key={t.from} y={t.from} stroke="var(--ui-border-strong)" strokeDasharray="4 4"
              label={{ value: `${compactMoney(t.from, cur)} · ${eur(t.amount, cur)}`, position: i === 0 ? "insideTopRight" : "insideBottomRight", fontSize: 11, fill: INK.secondary }} />
          ))}
          <Tooltip
            cursor={{ stroke: INK.border }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as Day | undefined) : undefined;
              if (!d) return null;
              return (
                <TooltipBox
                  title={dayLabel(d.date)}
                  rows={[
                    { key: "day", label: "Tog dana", value: eur(d.counted, cur) },
                    ...(d.cumulative !== null ? [{ key: "cum", label: "Ukupno do tad", value: eur(d.cumulative, cur), color: GREEN }] : []),
                  ]}
                />
              );
            }}
          />
          <Area type="monotone" dataKey="cumulative" stroke={GREEN} strokeWidth={2} fill={GREEN} fillOpacity={0.12} connectNulls={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Goal input for one product: saves on Enter / blur when the value changed.
function GoalInput({ siteId, product, goal, cur, onSaved }: {
  siteId: string; product: string; goal: number | null; cur: string; onSaved: () => void;
}) {
  const [value, setValue] = useState(goal ? String(goal) : "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const save = async () => {
    const next = value.trim() === "" ? null : Number(value.replace(/\./g, "").replace(",", "."));
    if (next === goal || (next === 0 && goal === null)) return;
    if (next !== null && (!Number.isFinite(next) || next < 0)) return setState("error");
    setState("saving");
    const res = await fetch("/api/bonus/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, product, goal: next }),
    }).catch(() => null);
    setState(res?.ok ? "idle" : "error");
    if (res?.ok) onSaved();
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input
        inputMode="numeric"
        aria-label={`Cilj za ${product}`}
        placeholder="—"
        value={value}
        onChange={(e) => { setValue(e.target.value); setState("idle"); }}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{
          width: 72, fontSize: 13, textAlign: "right", padding: "4px 8px", borderRadius: 6, fontVariantNumeric: "tabular-nums",
          border: `1px solid ${state === "error" ? "#DC2626" : INK.border}`, background: state === "saving" ? INK.grid : "var(--ui-surface)",
        }}
      />
      <span style={{ fontSize: 12, color: INK.muted }}>{cur === "EUR" ? "€" : cur}</span>
    </span>
  );
}

function GoalProgress({ value, goal }: { value: number; goal: number | null }) {
  if (!goal) return <span style={{ color: INK.muted }}>—</span>;
  const ratio = value / goal;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <span style={{ width: 48, height: 6, background: INK.grid, borderRadius: 3, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(1, ratio) * 100}%`, background: ratio >= 1 ? "#15803D" : GREEN }} />
      </span>
      <span style={{ width: 40, textAlign: "right", fontWeight: ratio >= 1 ? 600 : 400, color: ratio >= 1 ? "var(--tone-green-strong)" : INK.secondary }}>{pct(ratio, 0)}</span>
    </span>
  );
}

function SiteProducts({ site, cur, canEdit, onSaved }: { site: SiteRow; cur: string; canEdit: boolean; onSaved: () => void }) {
  const sub: React.CSSProperties = { ...td, padding: "7px 8px", fontSize: 12.5 };
  const subTh: React.CSSProperties = { ...th, padding: "8px 8px" };
  return (
    <tr>
      <td colSpan={6} style={{ padding: "0 4px 10px 28px", background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}` }}>
        {site.products.length === 0 ? (
          <p style={{ fontSize: 12, color: INK.muted, margin: 0, padding: "12px" }}>Nema prodatih proizvoda u ovom periodu.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...subTh, textAlign: "left" }}>Proizvod</th>
                <th style={subTh}>Kom.</th>
                <th style={subTh}>Promet</th>
                <th style={subTh}>Obračunski</th>
                <th style={subTh}>Cilj</th>
                <th style={subTh}>Ostvareno</th>
              </tr>
            </thead>
            <tbody>
              {site.products.map((p) => (
                <tr key={p.name} style={{ borderTop: `1px solid ${INK.grid}` }}>
                  <td style={{ ...sub, textAlign: "left", whiteSpace: "normal" }}>{p.name}</td>
                  <td style={sub}>{p.units.toLocaleString("sr-RS")}</td>
                  <td style={sub}>{eur(p.revenue, cur)}</td>
                  <td style={{ ...sub, fontWeight: 600 }}>{eur(p.counted, cur)}</td>
                  <td style={sub}>
                    {canEdit ? (
                      <GoalInput key={`${p.name}:${p.goal}`} siteId={site.site_id} product={p.name} goal={p.goal} cur={cur} onSaved={onSaved} />
                    ) : p.goal ? eur(p.goal, cur) : <span style={{ color: INK.muted }}>—</span>}
                  </td>
                  <td style={sub}><GoalProgress value={p.counted} goal={p.goal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

function SitesTable({ data, onSaved }: { data: BonusData; onSaved: () => void }) {
  const cur = data.base_currency;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <ChartCard title="Promet po sajtovima" subtitle="Partneri ulaze sa 50% · klikni na sajt za proizvode i ciljeve (cilj se poredi sa obračunskim prometom)">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
              <th style={{ ...th, textAlign: "left" }}>Sajt</th>
              <th style={th}>Porudžbine</th>
              <th style={th}>Promet</th>
              <th style={th}>Računa se</th>
              <th style={th}>Obračunski promet</th>
              <th style={th}>Cilj</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((s) => {
              const expanded = open.has(s.site_id);
              const goal = s.products.reduce((n, p) => n + (p.goal ?? 0), 0);
              return (
                <Fragment key={s.site_id}>
                  <tr style={{ borderBottom: `1px solid ${INK.grid}`, cursor: "pointer" }} onClick={() => toggle(s.site_id)} className="hover:bg-zinc-50 dark:hover:bg-[var(--ui-subtle)]">
                    <td style={{ ...td, textAlign: "left" }}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={(e) => { e.stopPropagation(); toggle(s.site_id); }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
                      >
                        <ChevronRightIcon className="size-4" style={{ color: INK.muted, transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 120ms" }} aria-hidden />
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: chartColor(s.color), flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                        {s.share < 1 && <span style={{ fontSize: 11, color: "var(--tone-amber-deep)", background: "var(--tone-amber-2)", borderRadius: 4, padding: "1px 6px" }}>partner</span>}
                      </button>
                    </td>
                    <td style={td}>{s.orders.toLocaleString("sr-RS")}</td>
                    <td style={td}>{eur(s.revenue, cur)}</td>
                    <td style={{ ...td, color: INK.secondary }}>{pct(s.share, 0)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{eur(s.counted, cur)}</td>
                    <td style={td}>{goal ? <GoalProgress value={s.counted} goal={goal} /> : <span style={{ color: INK.muted }}>—</span>}</td>
                  </tr>
                  {expanded && <SiteProducts site={s} cur={cur} canEdit={data.can_edit} onSaved={onSaved} />}
                </Fragment>
              );
            })}
            <tr>
              <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>Ukupno</td>
              <td style={{ ...td, fontWeight: 600 }}>{data.sites.reduce((n, s) => n + s.orders, 0).toLocaleString("sr-RS")}</td>
              <td style={{ ...td, fontWeight: 600 }}>{eur(data.revenue, cur)}</td>
              <td style={td} />
              <td style={{ ...td, fontWeight: 700 }}>{eur(data.counted, cur)}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function TiersTable({ data }: { data: BonusData }) {
  const cur = data.base_currency;
  return (
    <ChartCard title="Tabela bonusa" subtitle={`Između pragova: procenat dostignutog praga × promet · deli se na ${data.people} osobe`}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
              <th style={{ ...th, textAlign: "left" }}>Ostvaren promet</th>
              <th style={th}>Procenat</th>
              <th style={th}>Ukupan bonus</th>
              <th style={th}>Po osobi</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${INK.grid}`, background: data.bonus.tierIndex < 0 ? "var(--tone-green-2)" : undefined }}>
              <td style={{ ...td, textAlign: "left" }}>Ispod {eur(data.tiers[0]?.from ?? 0, cur)}</td>
              <td style={td}>0%</td>
              <td style={td}>{eur(0, cur)}</td>
              <td style={td}>{eur(0, cur)}</td>
            </tr>
            {data.tiers.map((t, i) => {
              const reached = i === data.bonus.tierIndex;
              const big = isHeadline(t, i);
              return (
                <tr key={t.from} style={{ borderBottom: `1px solid ${INK.grid}`, background: reached ? "var(--tone-green-2)" : undefined }}>
                  <td style={{ ...td, textAlign: "left", fontWeight: big ? 700 : 400 }}>
                    {i === data.tiers.length - 1 ? `${eur(t.from, cur)}+` : eur(t.from, cur)}
                    {reached && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--tone-green-strong)", fontWeight: 600 }}>← sada</span>}
                  </td>
                  <td style={{ ...td, fontWeight: big ? 700 : 400 }}>{pct(t.rate, 2)}</td>
                  <td style={{ ...td, fontWeight: big ? 700 : 400 }}>{eur(t.amount, cur)}</td>
                  <td style={{ ...td, fontWeight: big ? 700 : 400 }}>{eur(t.per_person, cur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

export default function BonusPage() {
  const { data, error, isLoading, mutate } = useSWR<BonusData>("/api/bonus", jsonFetcher, { refreshInterval: 60_000 });
  const cur = data?.base_currency ?? "EUR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: INK.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          {data?.name ?? "Black Friday"}
        </h1>
        <p style={{ fontSize: 13, color: INK.muted, margin: "4px 0 0" }}>
          {data ? `Obračun bonusa · ${dayLabel(data.from)} – ${dayLabel(data.to)}${data.to.slice(0, 4)}. · neto promet (bez refundacija)` : "Obračun bonusa"}
        </p>
      </div>

      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div style={{ height: 320, background: INK.grid, borderRadius: 12 }} className="animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 12 }}>
            <Stat label="Obračunski promet" value={eur(data.counted, cur)} hint={`Ukupan promet ${eur(data.revenue, cur)}`} />
            <Stat
              label="Bonus ukupno"
              value={eur(data.bonus.total, cur)}
              hint={data.bonus.tierIndex < 0 ? `Prvi prag je ${eur(data.tiers[0]?.from ?? 0, cur)}` : `${pct(data.bonus.rate, 2)} od prometa`}
            />
            <Stat label="Po osobi" value={eur(data.bonus.perPerson, cur)} hint={`Deli se na ${data.people} osobe`} />
            <Stat
              label="Projekcija do kraja meseca"
              value={data.projected ? eur(data.projected.counted, cur) : "—"}
              hint={data.projected
                ? `Bonus ${eur(data.projected.bonus.total, cur)} · ${eur(data.projected.bonus.perPerson, cur)} po osobi`
                : data.elapsed_days >= data.total_days ? "Period je završen" : "Posle prvog punog dana"}
            />
          </div>

          <Progress data={data} />
          <SitesTable data={data} onSaved={() => mutate()} />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ gap: 16, alignItems: "start" }}>
            <CumulativeChart data={data} />
            <TiersTable data={data} />
          </div>
        </>
      )}
    </div>
  );
}
