"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { BLUE_RAMP, SERIES, chartColor, orderForSeparation } from "@/lib/utils/chart-color";
import { LoadError } from "@/components/dashboard/load-error";
import {
  AXIS_TICK, ChartCard, INK, Legend, Segmented, TooltipBox, compactMoney, money, monthLabel, pct,
} from "./chart-kit";

// ── data ─────────────────────────────────────────────────────────────────────

interface Overview {
  base_currency: string;
  months: string[];
  sites: { site_id: string; name: string; color: string; revenue: number[]; orders: number[]; aov: (number | null)[] }[];
  customers: { new_revenue: number[]; returning_revenue: number[]; new_customers: number[]; returning_orders: number[] };
  payments: { week: string; success: number; failed: number; rate: number | null }[];
  heatmap: { revenue: number[][]; orders: number[][] };
  cities: { name: string; revenue: number; orders: number }[];
}

type Months = 3 | 6 | 12;

// Recharts tooltip props, narrowed to what we read.
interface TipProps { active?: boolean; label?: string | number; payload?: { dataKey?: string | number; value?: number; payload?: Record<string, unknown> }[] }

const BAR = { maxBarSize: 24, stroke: "#fff", strokeWidth: 2 } as const; // 2px surface gap between stacked segments

// ── section ──────────────────────────────────────────────────────────────────

export function TrendsSection() {
  const sp = useSearchParams();
  const [months, setMonths] = useState<Months>(12);
  const siteId = sp.get("kpi_site");
  const url = `/api/analytics/overview?months=${months}${siteId ? `&siteId=${siteId}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<Overview>(url, jsonFetcher, { keepPreviousData: true });

  // Site colours made chart-safe, ordered so neighbours stay distinct under CVD.
  const sites = useMemo(
    () => orderForSeparation((data?.sites ?? []).map((s) => ({ ...s, chart: chartColor(s.color) })), (s) => s.chart),
    [data]
  );

  const body = (render: (d: Overview) => React.ReactNode, height = 260) =>
    error && !data ? <LoadError onRetry={() => mutate()} />
      : isLoading && !data ? <div style={{ height, background: INK.grid, borderRadius: 8 }} className="animate-pulse" />
      : data ? render(data) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: INK.primary, margin: 0 }}>Trendovi</h2>
          <p style={{ fontSize: 12, color: INK.muted, margin: "2px 0 0" }}>
            Po mesecima · beogradsko vreme · {siteId ? "izabrani sajt" : "svi sajtovi"}
          </p>
        </div>
        <Segmented<Months>
          label="Period trendova"
          value={months}
          onChange={setMonths}
          options={[{ value: 3, label: "3 meseca" }, { value: 6, label: "6 meseci" }, { value: 12, label: "12 meseci" }]}
        />
      </div>

      {body((d) => <MonthlyBySite data={d} sites={sites} />, 320)}

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, alignItems: "start" }}>
        {body((d) => <AovBySite data={d} sites={sites} />)}
        {body((d) => <NewVsReturning data={d} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, alignItems: "start" }}>
        {body((d) => <PaymentSuccess data={d} />)}
        {body((d) => <TopCities data={d} />)}
      </div>

      {body((d) => <PurchaseHeatmap data={d} />, 240)}
    </div>
  );
}

type ChartSite = Overview["sites"][number] & { chart: string };

// ── 1. monthly revenue / orders by site (stacked) ─────────────────────────────

function MonthlyBySite({ data, sites }: { data: Overview; sites: ChartSite[] }) {
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const cur = data.base_currency;
  const rows = data.months.map((m, i) => ({
    month: m,
    ...Object.fromEntries(sites.map((s) => [s.site_id, s[metric][i]])),
  }));
  const fmt = (v: number) => (metric === "revenue" ? money(v, cur) : v.toLocaleString("sr-RS"));
  const totals = data.months.map((_, i) => sites.reduce((s, x) => s + x[metric][i], 0));
  const best = totals.indexOf(Math.max(...totals));

  const renderTip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const rowsOut = [...sites].reverse().map((s) => ({ key: s.site_id, label: s.name, color: s.chart, value: fmt(Number(payload[0].payload?.[s.site_id] ?? 0)) }));
    const total = sites.reduce((sum, s) => sum + Number(payload[0].payload?.[s.site_id] ?? 0), 0);
    return <TooltipBox title={monthLabel(String(label), true)} rows={rowsOut} footer={`Ukupno: ${fmt(total)}`} />;
  };

  return (
    <ChartCard
      title={metric === "revenue" ? "Mesečni prihod po sajtovima" : "Mesečne porudžbine po sajtovima"}
      subtitle={totals[best] > 0 ? `Najjači mesec: ${monthLabel(data.months[best], true)} (${fmt(totals[best])})` : undefined}
      actions={
        <Segmented
          label="Mera"
          value={metric}
          onChange={setMetric}
          options={[{ value: "revenue", label: "Prihod" }, { value: "orders", label: "Porudžbine" }]}
        />
      }
    >
      <Legend items={[...sites].reverse().map((s) => ({ key: s.site_id, label: s.name, color: s.chart }))} />
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis
            tick={AXIS_TICK} axisLine={false} tickLine={false} width={56}
            tickFormatter={(v) => (metric === "revenue" ? compactMoney(v, cur) : String(v))}
          />
          <Tooltip content={(p) => renderTip(p as unknown as TipProps)} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
          {sites.map((s, i) => (
            <Bar
              key={s.site_id}
              dataKey={s.site_id}
              name={s.name}
              stackId="sites"
              fill={s.chart}
              {...BAR}
              radius={i === sites.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 2. average order value by site ────────────────────────────────────────────

function AovBySite({ data, sites }: { data: Overview; sites: ChartSite[] }) {
  const cur = data.base_currency;
  const rows = data.months.map((m, i) => ({ month: m, ...Object.fromEntries(sites.map((s) => [s.site_id, s.aov[i]])) }));

  const renderTip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <TooltipBox
        title={monthLabel(String(label), true)}
        rows={sites
          .filter((s) => payload[0].payload?.[s.site_id] != null)
          .map((s) => ({ key: s.site_id, label: s.name, color: s.chart, value: money(Number(payload[0].payload?.[s.site_id]), cur) }))}
      />
    );
  };

  return (
    <ChartCard title="Prosečna vrednost porudžbine po sajtu" subtitle="Prihod ÷ broj plaćenih porudžbina, po mesecu">
      <Legend items={sites.map((s) => ({ key: s.site_id, label: s.name, color: s.chart }))} />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => compactMoney(v, cur)} />
          <Tooltip content={(p) => renderTip(p as unknown as TipProps)} cursor={{ stroke: INK.border, strokeWidth: 1 }} />
          {sites.map((s) => (
            <Line
              key={s.site_id}
              type="monotone"
              dataKey={s.site_id}
              name={s.name}
              stroke={s.chart}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 3. new vs returning customers ────────────────────────────────────────────

function NewVsReturning({ data }: { data: Overview }) {
  const cur = data.base_currency;
  const c = data.customers;
  const rows = data.months.map((m, i) => ({
    month: m, novi: c.new_revenue[i], povratni: c.returning_revenue[i],
    noviN: c.new_customers[i], povratniN: c.returning_orders[i],
  }));
  const totalNew = c.new_revenue.reduce((a, b) => a + b, 0);
  const totalRet = c.returning_revenue.reduce((a, b) => a + b, 0);
  const share = totalNew + totalRet ? totalRet / (totalNew + totalRet) : 0;

  const renderTip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof rows)[number];
    return (
      <TooltipBox
        title={monthLabel(String(label), true)}
        rows={[
          { key: "r", label: `Povratni (${p.povratniN} porudžb.)`, color: SERIES.orange, value: money(p.povratni, cur) },
          { key: "n", label: `Novi (${p.noviN} kupaca)`, color: SERIES.blue, value: money(p.novi, cur) },
        ]}
        footer={`Ukupno: ${money(p.novi + p.povratni, cur)}`}
      />
    );
  };

  return (
    <ChartCard title="Novi i povratni kupci" subtitle={`Povratni kupci donose ${pct(share)} prihoda u periodu`}>
      <Legend items={[{ key: "r", label: "Povratni kupci", color: SERIES.orange }, { key: "n", label: "Prva kupovina", color: SERIES.blue }]} />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m)} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => compactMoney(v, cur)} />
          <Tooltip content={(p) => renderTip(p as unknown as TipProps)} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
          <Bar dataKey="novi" name="Prva kupovina" stackId="c" fill={SERIES.blue} {...BAR} />
          <Bar dataKey="povratni" name="Povratni kupci" stackId="c" fill={SERIES.orange} {...BAR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 4. payment success rate ──────────────────────────────────────────────────

const shortDate = new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const weekLabel = (w: string) => shortDate.format(new Date(`${w}T00:00:00Z`)).replace(/\.$/, "");

function PaymentSuccess({ data }: { data: Overview }) {
  const rows = data.payments.map((p) => ({ ...p, pctRate: p.rate === null ? null : Math.round(p.rate * 1000) / 10 }));
  const success = data.payments.reduce((s, p) => s + p.success, 0);
  const failed = data.payments.reduce((s, p) => s + p.failed, 0);
  const overall = success + failed ? success / (success + failed) : null;

  const renderTip = ({ active, payload }: TipProps) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof rows)[number];
    return (
      <TooltipBox
        title={`Nedelja od ${weekLabel(p.week)}`}
        rows={[
          { key: "s", label: "Uspešna plaćanja", value: String(p.success) },
          { key: "f", label: "Neuspela plaćanja", value: String(p.failed) },
        ]}
        footer={`Uspešnost: ${p.rate === null ? "—" : pct(p.rate)}`}
      />
    );
  };

  return (
    <ChartCard
      title="Uspešnost naplate"
      subtitle={overall === null ? "Nema pokušaja plaćanja u periodu" : `Uspešno ${pct(overall)} pokušaja · ${failed.toLocaleString("sr-RS")} neuspelih`}
    >
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="week" tickFormatter={weekLabel} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={(p) => renderTip(p as unknown as TipProps)} cursor={{ stroke: INK.border, strokeWidth: 1 }} />
          <Line type="monotone" dataKey="pctRate" stroke={SERIES.blue} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 5. top cities ────────────────────────────────────────────────────────────

function TopCities({ data }: { data: Overview }) {
  const cur = data.base_currency;
  const max = Math.max(...data.cities.map((c) => c.revenue), 1);
  return (
    <ChartCard title="Top 10 gradova" subtitle="Po prihodu u periodu (gde je grad upisan)">
      {data.cities.length === 0 ? (
        <p style={{ fontSize: 13, color: INK.muted }}>Nema podataka o gradovima.</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {data.cities.map((c, i) => (
            <li
              key={c.name}
              title={`${c.name}: ${money(c.revenue, cur)} · ${c.orders} porudžbina`}
              style={{ display: "grid", gridTemplateColumns: "22px minmax(80px, 130px) 1fr auto", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <span style={{ color: INK.muted, fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{i + 1}.</span>
              <span style={{ color: INK.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ height: 12, background: INK.grid, borderRadius: 4 }}>
                <span style={{ display: "block", height: "100%", width: `${(c.revenue / max) * 100}%`, background: SERIES.blue, borderRadius: "0 4px 4px 0" }} />
              </span>
              <span style={{ color: INK.secondary, fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 72, textAlign: "right" }}>
                {compactMoney(c.revenue, cur)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

// ── 6. weekday × hour heatmap ────────────────────────────────────────────────

const DAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];
const DAYS_LONG = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"];

function PurchaseHeatmap({ data }: { data: Overview }) {
  const [metric, setMetric] = useState<"orders" | "revenue">("orders");
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const cur = data.base_currency;
  const grid = data.heatmap[metric];
  const max = Math.max(...grid.flat(), 0);
  // Quantize into the sequential blue ramp; empty cells stay on the surface.
  const color = (v: number) => (v <= 0 || max === 0 ? "#F8F8F8" : BLUE_RAMP[Math.min(BLUE_RAMP.length - 1, Math.floor((v / max) * BLUE_RAMP.length))]);
  const fmt = (v: number) => (metric === "revenue" ? money(v, cur) : `${v} porudžb.`);

  let peak = { d: 0, h: 0, v: -1 };
  grid.forEach((row, d) => row.forEach((v, h) => { if (v > peak.v) peak = { d, h, v }; }));

  return (
    <ChartCard
      title="Kada kupci kupuju"
      subtitle={peak.v > 0 ? `Najjači termin: ${DAYS_LONG[peak.d].toLowerCase()} ${peak.h}–${peak.h + 1}h · beogradsko vreme` : "Dan u nedelji × sat"}
      actions={
        <Segmented label="Mera" value={metric} onChange={setMetric}
          options={[{ value: "orders", label: "Porudžbine" }, { value: "revenue", label: "Prihod" }]} />
      }
    >
      <div style={{ overflowX: "auto" }}>
        <div role="table" aria-label="Porudžbine po danu i satu" style={{ minWidth: 560 }}>
          <div role="row" style={{ display: "grid", gridTemplateColumns: "36px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} role="columnheader" style={{ fontSize: 10, color: INK.muted, textAlign: "center" }}>{h % 3 === 0 ? h : ""}</span>
            ))}
          </div>
          {grid.map((row, d) => (
            <div key={d} role="row" style={{ display: "grid", gridTemplateColumns: "36px repeat(24, 1fr)", gap: 2, marginBottom: 2 }}>
              <span role="rowheader" style={{ fontSize: 11, color: INK.secondary, alignSelf: "center" }}>{DAYS[d]}</span>
              {row.map((v, h) => (
                <span
                  key={h}
                  role="cell"
                  aria-label={`${DAYS_LONG[d]} ${h}h: ${fmt(v)}`}
                  onMouseEnter={() => setHover({ d, h })}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    height: 22, borderRadius: 4, background: color(v),
                    outline: hover?.d === d && hover?.h === h ? `2px solid ${INK.primary}` : "none", outlineOffset: -1,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap", minHeight: 20 }}>
        <span style={{ fontSize: 12, color: INK.secondary }}>
          {hover
            ? `${DAYS_LONG[hover.d]}, ${hover.h}–${hover.h + 1}h: ${metric === "revenue" ? money(data.heatmap.revenue[hover.d][hover.h], cur) : data.heatmap.orders[hover.d][hover.h]} ${metric === "revenue" ? `· ${data.heatmap.orders[hover.d][hover.h]} porudžb.` : "porudžbina"}`
            : "Pređi mišem preko polja za detalje"}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: INK.muted }}>
          manje
          {BLUE_RAMP.map((c) => <span key={c} aria-hidden style={{ width: 14, height: 10, borderRadius: 2, background: c }} />)}
          više
        </span>
      </div>
    </ChartCard>
  );
}
