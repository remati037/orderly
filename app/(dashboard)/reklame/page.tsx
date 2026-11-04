"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { ChevronRightIcon } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { ChartCard, INK, Segmented, TooltipBox, pct } from "@/components/dashboard/analytics/chart-kit";
import type { AccountReport, AdsetReport, CampaignReport, DayPoint, Metrics, PeriodKey, Verdict, VerdictLevel } from "@/lib/ads/report";

interface Account extends AccountReport {
  id: string; name: string; currency: string; status: number | null; synced_at: string | null; error: string | null;
  target_cpa: number | null; target_estimated: boolean;
}
interface Recommendation {
  id: string; created_at: string; account_name: string | null; level: string;
  entity_name: string | null; type: string; priority: number; text: string;
}
interface LiveData {
  base_currency: string;
  synced_at: string | null;
  black_friday: { name: string; from: string; to: string; counted: number; goal: number } | null;
  totals: Metrics;
  previous: Metrics | null;
  net: number;
  real_roas: number | null;
  accounts: Account[];
  unmapped_spending: number;
  recommendations: Recommendation[];
}

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Danas" },
  { value: "yesterday", label: "Juče" },
  { value: "7d", label: "7 dana" },
  { value: "mtd", label: "Ovaj mesec" },
  { value: "30d", label: "30 dana" },
];

const GREEN = "#16A34A";
const RED = "#DC2626";
const BAR = "#2563EB";

const VERDICT: Record<VerdictLevel, { label: string; color: string; bg: string }> = {
  good: { label: "Dobro", color: "#15803D", bg: "#DCFCE7" },
  watch: { label: "Pazi", color: "#92400E", bg: "#FEF3C7" },
  bad: { label: "Loše", color: "#B91C1C", bg: "#FEE2E2" },
  low_data: { label: "Rano za ocenu", color: INK.secondary, bg: INK.grid },
  lead: { label: "Leadovi", color: "#1D4ED8", bg: "#DBEAFE" },
  idle: { label: "Bez potrošnje", color: INK.secondary, bg: INK.grid },
};

const money = (v: number | null, cur: string, digits = 2) =>
  v === null ? "—" : `${v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${cur === "EUR" ? "€" : cur}`;
const times = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);
const count = (v: number) => v.toLocaleString("de-DE");
const percent = (v: number | null) => (v === null ? "—" : pct(v, 2));

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

const th: React.CSSProperties = {
  padding: "8px 10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
  color: INK.muted, textAlign: "right", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "10px", fontSize: 13, color: INK.primary, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

function VerdictBadge({ verdict, withReason }: { verdict: Verdict; withReason?: boolean }) {
  const v = VERDICT[verdict.level];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: v.color, background: v.bg, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{v.label}</span>
      {withReason && <span style={{ fontSize: 13, color: INK.secondary }}>{verdict.reason}</span>}
    </span>
  );
}

// Change against the previous period. Whether up is good depends on the metric.
function Delta({ now, before, goodWhenUp }: { now: number | null; before: number | null | undefined; goodWhenUp?: boolean }) {
  if (now === null || before === null || before === undefined || before === 0) return null;
  const change = now / before - 1;
  const neutral = goodWhenUp === undefined || Math.abs(change) < 0.005;
  const good = goodWhenUp ? change > 0 : change < 0;
  return (
    <span style={{ fontSize: 12, color: neutral ? INK.secondary : good ? "#15803D" : "#B91C1C" }}>
      {change > 0 ? "+" : ""}{pct(change, 0)}
    </span>
  );
}

function Stat({ label, value, delta, hint }: { label: string; value: string; delta?: React.ReactNode; hint?: string }) {
  return (
    <div style={{ background: "#FAFAFA", borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <p style={{ fontSize: 12, color: INK.secondary, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: INK.primary, margin: "4px 0 0", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {delta && <p style={{ margin: "2px 0 0", lineHeight: 1.3 }}>{delta}</p>}
      {hint && <p style={{ fontSize: 12, color: INK.muted, margin: "2px 0 0" }}>{hint}</p>}
    </div>
  );
}

function BlackFriday({ data }: { data: NonNullable<LiveData["black_friday"]> }) {
  const fill = data.goal > 0 ? Math.min(1, Math.max(0, data.counted / data.goal)) : 0;
  return (
    <ChartCard
      title={`${data.name}: napredak ka ${money(data.goal, "EUR", 0)}`}
      subtitle={<>Obračunski neto promet <strong style={{ color: INK.primary }}>{money(data.counted, "EUR", 0)}</strong> ({pct(fill, 1)}), isti obračun kao tab Black Friday</>}
    >
      <div style={{ height: 14, background: INK.grid, borderRadius: 7, overflow: "hidden" }}>
        <div style={{ width: `${fill * 100}%`, height: "100%", background: GREEN, borderRadius: 7, transition: "width 300ms" }} />
      </div>
    </ChartCard>
  );
}

// One row per account, biggest spend first: where the money goes and how it's doing.
function AccountsOverview({ data, cur }: { data: LiveData; cur: string }) {
  return (
    <ChartCard title="Svi nalozi" subtitle="Klikni na nalog za detalje. Iznosi su preračunati u evre.">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
              <th style={{ ...th, textAlign: "left" }}>Nalog</th>
              <th style={th}>Potrošnja</th>
              <th style={th}>Prodaje</th>
              <th style={th}>Prihod po Meta</th>
              <th style={th}>Cena prodaje</th>
              <th style={th}>ROAS</th>
              <th style={th}>Leadovi</th>
              <th style={{ ...th, textAlign: "left" }}>Ocena</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.id} style={{ borderBottom: `1px solid ${INK.grid}` }} className="hover:bg-zinc-50">
                <td style={{ ...td, textAlign: "left" }}>
                  <a href={`#nalog-${a.id}`} style={{ fontWeight: 600, color: INK.primary, textDecoration: "underline", textDecorationColor: INK.border, textUnderlineOffset: 3 }}>{a.name}</a>
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{money(a.metrics.spend, cur)}</td>
                <td style={td}>{count(a.metrics.purchases)}</td>
                <td style={td}>{money(a.metrics.revenue, cur)}</td>
                <td style={td}>{money(a.metrics.cpa, cur)}</td>
                <td style={td}>{times(a.metrics.roas)}</td>
                <td style={td}>{a.metrics.leads ? count(a.metrics.leads) : "—"}</td>
                <td style={{ ...td, textAlign: "left" }}><VerdictBadge verdict={a.verdict} /></td>
              </tr>
            ))}
            {data.accounts.length > 1 && (
              <tr>
                <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>Ukupno</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(data.totals.spend, cur)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{count(data.totals.purchases)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(data.totals.revenue, cur)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money(data.totals.cpa, cur)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{times(data.totals.roas)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{data.totals.leads ? count(data.totals.leads) : "—"}</td>
                <td style={td} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: INK.muted, margin: "12px 0 0" }}>
        Orderly neto za isti period, svi sajtovi: <strong style={{ color: INK.secondary }}>{money(data.net, cur, 0)}</strong>, što je {times(data.real_roas)} u odnosu na potrošnju. U taj broj ulazi i prodaja koja nije od reklama.
      </p>
    </ChartCard>
  );
}

// Where people drop off, with the cost of each step.
function Funnel({ m, cur }: { m: Metrics; cur: string }) {
  const steps = [
    { label: "Prikazi", value: m.impressions },
    { label: "Klikovi na link", value: m.clicks },
    { label: "Poseta stranici", value: m.landing_page_views },
    { label: "Dodato u korpu", value: m.add_to_cart },
    { label: "Započeto plaćanje", value: m.initiate_checkout },
    { label: "Prodaje", value: m.purchases },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8 }}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : 0;
        return (
          <div key={s.label} style={{ borderLeft: `2px solid ${INK.border}`, padding: "2px 0 2px 10px", minWidth: 0 }}>
            <p style={{ fontSize: 12, color: INK.secondary, margin: 0 }}>{s.label}</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: INK.primary, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>{count(s.value)}</p>
            <p style={{ fontSize: 11, color: INK.muted, margin: "1px 0 0", fontVariantNumeric: "tabular-nums" }}>
              {s.value > 0 ? `${money(m.spend / s.value, cur, s.value > 1000 ? 4 : 2)} po` : "—"}{i > 0 && prev > 0 && s.value <= prev ? ` · ${pct(s.value / prev, 1)} od preth.` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function DailyBars({ title, data, dataKey, format }: {
  title: string; data: DayPoint[]; dataKey: "spend" | "purchases"; format: (v: number) => string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: INK.secondary, margin: "0 0 6px" }}>{title}</p>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={3}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 10, fill: INK.muted }} axisLine={false} tickLine={false} interval={3} />
          <YAxis tick={{ fontSize: 10, fill: INK.muted }} axisLine={false} tickLine={false} width={34} allowDecimals={dataKey === "spend"} />
          <Tooltip
            cursor={{ fill: INK.grid }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as DayPoint | undefined) : undefined;
              if (!d) return null;
              return <TooltipBox title={dayLabel(d.date)} rows={[{ key: dataKey, label: title, value: format(d[dataKey]) }]} />;
            }}
          />
          <Bar dataKey={dataKey} fill={BAR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdsetRows({ adset, cur }: { adset: AdsetReport; cur: string }) {
  const sub: React.CSSProperties = { ...td, padding: "7px 10px", fontSize: 12.5 };
  return (
    <>
      <tr style={{ background: "#FAFAFA", borderBottom: `1px solid ${INK.grid}` }}>
        <td style={{ ...sub, textAlign: "left", whiteSpace: "normal", paddingLeft: 30, fontWeight: 600 }}>{adset.name}</td>
        <td style={sub}>{money(adset.metrics.spend, cur)}</td>
        <td style={sub}>{count(adset.metrics.purchases)}</td>
        <td style={sub}>{money(adset.metrics.cpa, cur)}</td>
        <td style={sub}>{times(adset.metrics.roas)}</td>
        <td style={sub}>{percent(adset.metrics.ctr)}</td>
        <td style={sub}>{money(adset.metrics.cpm, cur)}</td>
        <td style={sub}>—</td>
        <td style={{ ...sub, textAlign: "left" }}><VerdictBadge verdict={adset.verdict} /></td>
      </tr>
      {adset.ads.map((ad) => (
        <tr key={ad.id} style={{ background: "#FAFAFA", borderBottom: `1px solid ${INK.grid}` }}>
          <td style={{ ...sub, textAlign: "left", whiteSpace: "normal", paddingLeft: 46, color: INK.secondary }}>
            {ad.name}
            {ad.status && ad.status !== "ACTIVE" && <span style={{ marginLeft: 6, fontSize: 11, color: INK.muted }}>({ad.status === "DISAPPROVED" ? "odbijen" : "pauziran"})</span>}
          </td>
          <td style={sub}>{money(ad.metrics.spend, cur)}</td>
          <td style={sub}>{count(ad.metrics.purchases)}</td>
          <td style={sub}>{money(ad.metrics.cpa, cur)}</td>
          <td style={sub}>{times(ad.metrics.roas)}</td>
          <td style={sub}>{percent(ad.metrics.ctr)}</td>
          <td style={sub}>{money(ad.metrics.cpm, cur)}</td>
          <td style={sub}>{ad.frequency.toFixed(2).replace(".", ",")}</td>
          <td style={{ ...sub, textAlign: "left" }}><VerdictBadge verdict={ad.verdict} /></td>
        </tr>
      ))}
    </>
  );
}

function CampaignRow({ campaign: c, cur }: { campaign: CampaignReport; cur: string }) {
  const [open, setOpen] = useState(false);
  const change = c.previous && c.previous.spend > 0 ? c.metrics.spend / c.previous.spend - 1 : null;
  return (
    <Fragment>
      <tr style={{ borderBottom: `1px solid ${INK.grid}`, cursor: "pointer" }} onClick={() => setOpen((o) => !o)} className="hover:bg-zinc-50">
        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 260 }}>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
          >
            <ChevronRightIcon className="size-4" style={{ color: INK.muted, flexShrink: 0, marginTop: 2, transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }} aria-hidden />
            <span>
              <span style={{ fontWeight: 500 }}>{c.name}</span>
              {!c.active && <span style={{ marginLeft: 8, fontSize: 11, color: INK.secondary, background: INK.grid, borderRadius: 4, padding: "1px 6px" }}>pauzirana</span>}
              <span style={{ display: "block", fontSize: 12, color: INK.muted, marginTop: 2 }}>
                {c.site_name ?? "Nije povezana sa sajtom"}{c.real_roas_site !== null ? ` · stvarni ROAS sajta ${times(c.real_roas_site)}` : ""}
              </span>
            </span>
          </button>
        </td>
        <td style={{ ...td, fontWeight: 600 }}>
          {money(c.metrics.spend, cur)}
          {change !== null && <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: INK.muted }}>{change > 0 ? "+" : ""}{pct(change, 0)}</span>}
        </td>
        <td style={td}>{count(c.metrics.purchases)}{c.metrics.leads > 0 && <span style={{ display: "block", fontSize: 11, color: INK.muted }}>{count(c.metrics.leads)} leadova</span>}</td>
        <td style={{ ...td, color: c.verdict.level === "bad" && c.metrics.cpa !== null ? RED : INK.primary }}>{money(c.metrics.cpa, cur)}</td>
        <td style={td}>{times(c.metrics.roas)}</td>
        <td style={td}>{percent(c.metrics.ctr)}</td>
        <td style={td}>{money(c.metrics.cpm, cur)}</td>
        <td style={td}>—</td>
        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 200 }}>
          <VerdictBadge verdict={c.verdict} />
          <span style={{ display: "block", fontSize: 12, color: INK.secondary, marginTop: 4 }}>{c.verdict.reason}</span>
        </td>
      </tr>
      {open && c.adsets.map((s) => <AdsetRows key={s.id} adset={s} cur={cur} />)}
    </Fragment>
  );
}

function AdList({ title, empty, items, cur }: { title: string; empty: string; items: Account["best_ads"]; cur: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: INK.primary, margin: "0 0 10px" }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: INK.muted, margin: 0 }}>{empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((c) => (
            <div key={c.ad_id} style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              {c.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived Meta CDN URLs, not worth optimizing
                <img src={c.thumbnail_url} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: INK.grid }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0, background: INK.grid }} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: INK.primary, margin: 0, overflowWrap: "anywhere" }}>
                  {c.name}
                  {c.fatigued && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", borderRadius: 4, padding: "1px 6px" }}>zamor</span>}
                </p>
                <p style={{ fontSize: 12, color: INK.secondary, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                  {money(c.spend, cur)} · {c.purchases} prod. · cena prodaje {c.cpa === null ? "—" : money(c.cpa, cur)} · frekv. {c.frequency.toFixed(2).replace(".", ",")} · CTR {c.ctr.toFixed(2).replace(".", ",")}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountSection({ account: a, cur }: { account: Account; cur: string }) {
  const m = a.metrics;
  const p = a.previous;
  const subtitle = [
    a.target_cpa !== null
      ? `Prag cene prodaje ${money(a.target_cpa, cur)}${a.target_estimated ? " (procena: prosek naloga za 30 dana)" : ""}`
      : "Prag cene prodaje nije određen",
    a.currency !== cur ? `nalog je u ${a.currency}, prikazano u ${cur}` : null,
    a.synced_at ? `osveženo u ${timeLabel(a.synced_at)}` : "još nije sinhronizovano",
  ].filter(Boolean).join(" · ");

  return (
    <section id={`nalog-${a.id}`} style={{ scrollMarginTop: 16 }}>
      <ChartCard title={a.name} subtitle={subtitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {a.error && (
            <p style={{ fontSize: 12, color: RED, background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", margin: 0 }}>
              Poslednje osvežavanje nije uspelo, brojke mogu da kasne: {a.error}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <VerdictBadge verdict={a.verdict} withReason />
            {p && <span style={{ fontSize: 12, color: INK.muted }}>Procenti: promena u odnosu na prethodni isti period</span>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gap: 8 }}>
            <Stat label="Potrošnja" value={money(m.spend, cur)} delta={<Delta now={m.spend} before={p?.spend} />} />
            <Stat label="Prodaje" value={count(m.purchases)} delta={<Delta now={m.purchases} before={p?.purchases} goodWhenUp />} hint={m.leads ? `${count(m.leads)} leadova` : undefined} />
            <Stat label="Prihod po Meta" value={money(m.revenue, cur)} delta={<Delta now={m.revenue} before={p?.revenue} goodWhenUp />} />
            <Stat label="Cena prodaje (CPA)" value={money(m.cpa, cur)} delta={<Delta now={m.cpa} before={p?.cpa} />} />
            <Stat label="ROAS po Meta" value={times(m.roas)} delta={<Delta now={m.roas} before={p?.roas} goodWhenUp />} />
            <Stat label="CTR / CPM" value={percent(m.ctr)} hint={`CPM ${money(m.cpm, cur)}`} />
          </div>

          <Funnel m={m} cur={cur} />

          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
            <DailyBars title="Potrošnja po danu, 14 dana" data={a.daily} dataKey="spend" format={(v) => money(v, cur)} />
            <DailyBars title="Prodaje po danu, 14 dana" data={a.daily} dataKey="purchases" format={count} />
          </div>

          {a.campaigns.length === 0 ? (
            <p style={{ fontSize: 13, color: INK.muted, margin: 0 }}>Nema potrošnje u ovom periodu.</p>
          ) : (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: INK.primary, margin: "0 0 4px" }}>Kampanje</p>
              <p style={{ fontSize: 12, color: INK.muted, margin: "0 0 8px" }}>Klikni na kampanju za ad setove i oglase.</p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
                      <th style={{ ...th, textAlign: "left" }}>Kampanja</th>
                      <th style={th}>Potrošnja</th>
                      <th style={th}>Prodaje</th>
                      <th style={th}>Cena prod.</th>
                      <th style={th}>ROAS</th>
                      <th style={th}>CTR</th>
                      <th style={th}>CPM</th>
                      <th style={th}>Frekv.</th>
                      <th style={{ ...th, textAlign: "left" }}>Ocena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.campaigns.map((c) => <CampaignRow key={c.id} campaign={c} cur={cur} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20, alignItems: "start" }}>
            <AdList title="Oglasi koji rade najbolje" empty="Nijedan oglas još nema prodaju uz dovoljno potrošnje." items={a.best_ads} cur={cur} />
            <AdList title="Oglasi koji ne rade" empty="Nema oglasa sa lošim rezultatom u ovom periodu." items={a.worst_ads} cur={cur} />
          </div>

          {a.idle_campaigns.length > 0 && (
            <details style={{ fontSize: 13, color: INK.secondary }}>
              <summary style={{ cursor: "pointer" }}>Aktivne na Meta, bez potrošnje u ovom periodu: {a.idle_campaigns.length}</summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {a.idle_campaigns.map((name, i) => <li key={`${name}-${i}`} style={{ overflowWrap: "anywhere" }}>{name}</li>)}
              </ul>
            </details>
          )}
        </div>
      </ChartCard>
    </section>
  );
}

const TYPE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  skaliraj: { label: "Skaliraj", color: "#15803D", bg: "#DCFCE7" },
  ugasi: { label: "Ugasi", color: RED, bg: "#FEE2E2" },
  osvezi_kreativu: { label: "Osveži kreativu", color: "#92400E", bg: "#FEF3C7" },
  proveri: { label: "Proveri", color: INK.secondary, bg: INK.grid },
};

function Recommendations({ items, onDone }: { items: Recommendation[]; onDone: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const done = async (id: string) => {
    setSaving(id);
    setFailed(false);
    const res = await fetch("/api/ads/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    setSaving(null);
    if (res?.ok) onDone();
    else setFailed(true);
  };

  return (
    <ChartCard title="Šta danas raditi" subtitle="Claude preporuke u 9, 14 i 20h. Izmene na nalogu se rade ručno ili uz odobrenje.">
      {failed && <p style={{ fontSize: 12, color: RED, margin: "0 0 8px" }}>Čuvanje nije uspelo, pokušaj ponovo.</p>}
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: INK.muted, margin: 0 }}>Trenutno nema otvorenih preporuka.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((r, i) => {
            const type = TYPE_LABEL[r.type] ?? TYPE_LABEL.proveri;
            return (
              <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: i ? `1px solid ${INK.grid}` : undefined }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 12, color: INK.muted }}>
                    <span style={{ fontWeight: 600, color: type.color, background: type.bg, borderRadius: 4, padding: "1px 6px", marginRight: 8 }}>{type.label}</span>
                    {[r.account_name, r.entity_name].filter(Boolean).join(" · ")}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: INK.primary, lineHeight: 1.45 }}>{r.text}</p>
                </div>
                <button
                  type="button"
                  disabled={saving === r.id}
                  onClick={() => done(r.id)}
                  style={{ flexShrink: 0, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 8, border: `1px solid ${INK.border}`, background: "#fff", color: INK.primary, cursor: "pointer", opacity: saving === r.id ? 0.5 : 1 }}
                >
                  Urađeno
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

export default function ReklamePage() {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const { data, error, isLoading, mutate } = useSWR<LiveData>(`/api/ads/live?period=${period}`, jsonFetcher, { refreshInterval: 60_000 });
  const cur = data?.base_currency ?? "EUR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: INK.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>Reklame</h1>
          <p style={{ fontSize: 13, color: INK.muted, margin: "4px 0 0" }}>
            {data?.synced_at ? `Meta podaci osveženi u ${timeLabel(data.synced_at)}` : "Meta kampanje po nalozima"}
          </p>
        </div>
        <Segmented label="Period" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
      </div>

      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : !data ? (
        <div style={{ height: 320, background: INK.grid, borderRadius: 12 }} className={isLoading ? "animate-pulse" : undefined} />
      ) : (
        <>
          {data.black_friday && <BlackFriday data={data.black_friday} />}
          <AccountsOverview data={data} cur={cur} />
          <Recommendations items={data.recommendations} onDone={() => mutate()} />

          {data.unmapped_spending > 0 && (
            <p style={{ fontSize: 13, color: "#92400E", background: "#FEF3C7", borderRadius: 8, padding: "10px 14px", margin: 0 }}>
              Kampanja sa potrošnjom koje nisu povezane sa sajtom: {data.unmapped_spending}. Za njih nema stvarnog ROAS-a i ne ulaze u profit. Povezuje se u Podešavanja → Facebook Ads.
            </p>
          )}

          {data.accounts.map((a) => <AccountSection key={a.id} account={a} cur={cur} />)}
        </>
      )}
    </div>
  );
}
