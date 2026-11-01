"use client";

import useSWR from "swr";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { chartColor } from "@/lib/utils/chart-color";
import { LoadError } from "@/components/dashboard/load-error";
import { ChartCard, INK, TooltipBox, compactMoney, pct } from "@/components/dashboard/analytics/chart-kit";

interface Tier { from: number; amount: number; rate: number; per_person: number }
interface BonusResult { tierIndex: number; rate: number; total: number; perPerson: number }
interface SiteRow { site_id: string; name: string; color: string; share: number; revenue: number; counted: number; orders: number }
interface Day { date: string; counted: number; cumulative: number | null }

interface BonusData {
  name: string;
  from: string;
  to: string;
  people: number;
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

const GREEN = "#16A34A";

// Whole euros: bonus figures are discussed in round numbers.
const eur = (v: number, cur: string) =>
  cur === "EUR" ? `${Math.round(v).toLocaleString("de-DE")} €` : `${Math.round(v).toLocaleString("de-DE")} ${cur}`;

// The first tier and the big jumps (100k, 150k, 200k) get marked on the bar and chart.
const isMilestone = (t: Tier, i: number, all: Tier[]) => i === 0 || t.amount > all[i - 1].amount * 1.3;

const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

const th: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
  color: INK.muted, textAlign: "right", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: INK.primary, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${INK.border}`, borderRadius: 12, padding: "16px 18px", minWidth: 0 }}>
      <p style={{ fontSize: 12, color: INK.muted, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: INK.primary, margin: "6px 0 0", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {hint && <p style={{ fontSize: 12, color: INK.secondary, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

// Progress across the tier ladder: bar from 0 to the last tier, ticks at the
// big steps, plus how much is still missing to the next tier.
function Progress({ data }: { data: BonusData }) {
  const cur = data.base_currency;
  const max = data.tiers[data.tiers.length - 1]?.from ?? 1;
  const next = data.tiers[data.bonus.tierIndex + 1];
  const fill = Math.min(1, Math.max(0, data.counted / max));
  const milestones = data.tiers.filter(isMilestone);

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
            <div style={{ width: 2, height: 22, background: data.counted >= t.from ? "#15803D" : "#D4D4D8", margin: "0 auto" }} />
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
  const milestones = data.tiers.filter(isMilestone);

  return (
    <ChartCard title="Obračunski promet kroz mesec" subtitle="Zbirno po danima · partnerski sajtovi sa 50%">
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data.days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} interval={Math.floor((data.days.length - 1) / 6)} />
          <YAxis domain={[0, top]} tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(v, cur)} width={52} />
          {milestones.map((t, i) => (
            <ReferenceLine key={t.from} y={t.from} stroke="#D4D4D8" strokeDasharray="4 4"
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

function SitesTable({ data }: { data: BonusData }) {
  const cur = data.base_currency;
  return (
    <ChartCard title="Promet po sajtovima" subtitle="Partnerski biznisi ulaze u obračun sa 50% prometa">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
              <th style={{ ...th, textAlign: "left" }}>Sajt</th>
              <th style={th}>Porudžbine</th>
              <th style={th}>Promet</th>
              <th style={th}>Računa se</th>
              <th style={th}>Obračunski promet</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((s) => (
              <tr key={s.site_id} style={{ borderBottom: `1px solid ${INK.grid}` }}>
                <td style={{ ...td, textAlign: "left" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: chartColor(s.color), flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    {s.share < 1 && <span style={{ fontSize: 11, color: "#92400E", background: "#FEF3C7", borderRadius: 4, padding: "1px 6px" }}>partner</span>}
                  </span>
                </td>
                <td style={td}>{s.orders.toLocaleString("sr-RS")}</td>
                <td style={td}>{eur(s.revenue, cur)}</td>
                <td style={{ ...td, color: INK.secondary }}>{pct(s.share, 0)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{eur(s.counted, cur)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>Ukupno</td>
              <td style={{ ...td, fontWeight: 600 }}>{data.sites.reduce((n, s) => n + s.orders, 0).toLocaleString("sr-RS")}</td>
              <td style={{ ...td, fontWeight: 600 }}>{eur(data.revenue, cur)}</td>
              <td style={td} />
              <td style={{ ...td, fontWeight: 700 }}>{eur(data.counted, cur)}</td>
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
            <tr style={{ borderBottom: `1px solid ${INK.grid}`, background: data.bonus.tierIndex < 0 ? "#DCFCE7" : undefined }}>
              <td style={{ ...td, textAlign: "left" }}>Ispod {eur(data.tiers[0]?.from ?? 0, cur)}</td>
              <td style={td}>0%</td>
              <td style={td}>{eur(0, cur)}</td>
              <td style={td}>{eur(0, cur)}</td>
            </tr>
            {data.tiers.map((t, i) => {
              const reached = i === data.bonus.tierIndex;
              const big = i > 0 && isMilestone(t, i, data.tiers);
              return (
                <tr key={t.from} style={{ borderBottom: `1px solid ${INK.grid}`, background: reached ? "#DCFCE7" : undefined }}>
                  <td style={{ ...td, textAlign: "left", fontWeight: big ? 700 : 400 }}>
                    {i === data.tiers.length - 1 ? `${eur(t.from, cur)}+` : eur(t.from, cur)}
                    {reached && <span style={{ marginLeft: 8, fontSize: 11, color: "#15803D", fontWeight: 600 }}>← sada</span>}
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
          {data?.name ?? "Bonus"}
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
          <CumulativeChart data={data} />

          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, alignItems: "start" }}>
            <SitesTable data={data} />
            <TiersTable data={data} />
          </div>
        </>
      )}
    </div>
  );
}
