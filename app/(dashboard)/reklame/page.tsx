"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { ChevronRightIcon } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { ChartCard, INK, Legend, Segmented, TooltipBox, pct } from "@/components/dashboard/analytics/chart-kit";
import { formatMoney, leadCount, type AccountReport, type AdsetReport, type CampaignReport, type Chip, type DayPoint, type Metrics, type PeriodKey, type Tone, type Verdict, type VerdictLevel } from "@/lib/ads/report";

interface Account extends AccountReport {
  id: string; name: string; currency: string; fb_account_id: string; status: number | null; synced_at: string | null; error: string | null;
  target_cpa: number | null; target_estimated: boolean;
  orderly_roas: { site_name: string | null; yesterday: number | null; week: number | null; period: number | null };
}
interface Recommendation {
  id: string; created_at: string; account_name: string | null; level: string;
  entity_name: string | null; type: string; priority: number; text: string;
}
interface LiveData {
  base_currency: string;
  synced_at: string | null;
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

const RED = "var(--tone-red)";
const SPEND_LINE = "var(--tone-blue)";
const REVENUE_LINE = "var(--tone-orange)";

const TONE: Record<Tone, { color: string; bg: string; bar: string }> = {
  good: { color: "var(--tone-green-strong)", bg: "var(--tone-green-2)", bar: "#22C55E" },
  watch: { color: "var(--tone-amber-deep)", bg: "var(--tone-amber-2)", bar: "#F59E0B" },
  bad: { color: "var(--tone-red-strong)", bg: "var(--tone-red-2)", bar: "#EF4444" },
  neutral: { color: INK.secondary, bg: INK.grid, bar: "var(--ui-faint)" },
};

const VERDICT: Record<VerdictLevel, { label: string; color: string; bg: string }> = {
  good: { label: "Dobro", color: "var(--tone-green-strong)", bg: "var(--tone-green-2)" },
  watch: { label: "Pazi", color: "var(--tone-amber-deep)", bg: "var(--tone-amber-2)" },
  bad: { label: "Loše", color: "var(--tone-red-strong)", bg: "var(--tone-red-2)" },
  low_data: { label: "Rano za ocenu", color: INK.secondary, bg: INK.grid },
  lead: { label: "Leadovi", color: "var(--tone-blue-strong)", bg: "var(--tone-blue-2)" },
  idle: { label: "Bez potrošnje", color: INK.secondary, bg: INK.grid },
};

const money = (v: number | null, cur: string, digits = 2) => (v === null ? "—" : formatMoney(v, cur, digits));
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
    <span style={{ fontSize: 12, color: neutral ? INK.secondary : good ? "var(--tone-green-strong)" : "var(--tone-red-strong)" }}>
      {change > 0 ? "+" : ""}{pct(change, 0)}
    </span>
  );
}

function Stat({ label, value, delta, hint }: { label: string; value: string; delta?: React.ReactNode; hint?: string }) {
  return (
    <div style={{ background: "var(--ui-sidebar)", borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <p style={{ fontSize: 12, color: INK.secondary, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: INK.primary, margin: "4px 0 0", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {delta && <p style={{ margin: "2px 0 0", lineHeight: 1.3 }}>{delta}</p>}
      {hint && <p style={{ fontSize: 12, color: INK.muted, margin: "2px 0 0" }}>{hint}</p>}
    </div>
  );
}

function ChipBadge({ chip }: { chip: Chip }) {
  const t = TONE[chip.tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: t.color, background: t.bg, borderRadius: 6, padding: "4px 8px", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: t.bar }} />
      {chip.label}
    </span>
  );
}

const ORDERLY_HINT = "Okvirno: sav neto prihod sajta iz Orderly-ja podeljen sa potrošnjom kampanja povezanih sa tim sajtom. Uključuje i prodaje koje nisu od reklama.";

function OrderlyRoas({ value }: { value: number | null }) {
  if (value === null) return null;
  return <p title={ORDERLY_HINT} style={{ fontSize: 12, fontWeight: 500, color: INK.secondary, margin: "2px 0 0", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>Orderly {times(value)}</p>;
}

const LINK_HINT = "Koliko kampanja sa potrošnjom u poslednjih 7 dana je povezano sa sajtom, pa može da se uporedi sa stvarnom prodajom u Orderly-ju.";

// Yesterday and the last 7 full days at a glance, independent of the period below.
function AccountCardTile({ account: a }: { account: Account }) {
  const { yesterday: y, week: w, trend, link, top_campaigns: top } = a.card;
  const cur = a.currency;
  const small: React.CSSProperties = { fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: INK.muted, margin: 0 };
  const big = y.roas !== null && y.roas < 1 ? "var(--tone-red-strong)" : "var(--tone-green-strong)";
  return (
    <a href={`#nalog-${a.id}`} style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--ui-surface)", border: `1px solid ${INK.border}`, borderTop: `4px solid ${TONE[trend.tone].bar}`, borderRadius: 12, padding: "16px 18px", color: "inherit", textDecoration: "none", minWidth: 0 }}>
      <div>
        <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: INK.primary, overflowWrap: "anywhere" }}>{a.name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: INK.secondary, background: INK.grid, borderRadius: 5, padding: "2px 6px" }}>{cur}</span>
        </p>
        <p style={{ fontSize: 12, color: INK.secondary, margin: "4px 0 0", lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {[...top.map((c) => `${c.name} ${money(c.spend, cur)}`), a.fb_account_id.replace(/^act_/, "")].join(" · ")}
        </p>
      </div>
      <div><ChipBadge chip={trend} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1fr)", gap: 14, alignItems: "end" }}>
        <div>
          <p style={small}>ROAS juče</p>
          <p style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, color: y.roas === null ? INK.muted : big, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
            {y.roas === null ? "—" : y.roas.toFixed(2).replace(".", ",")}
          </p>
          <OrderlyRoas value={a.orderly_roas.yesterday} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={small}>Juče</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: INK.primary, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>{money(y.spend, cur)}</p>
          <p style={{ fontSize: 12, color: INK.secondary, margin: "2px 0 0" }}>{count(y.purchases)} kup. · {money(y.revenue, cur)}</p>
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={small}>7 dana ROAS</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: INK.primary, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>{w.roas === null ? "—" : w.roas.toFixed(2).replace(".", ",")}</p>
          <OrderlyRoas value={a.orderly_roas.week} />
          <p style={{ fontSize: 12, color: INK.secondary, margin: "2px 0 0" }}>{money(w.spend, cur)} · {count(w.purchases)} kup.</p>
        </div>
      </div>
      <div title={LINK_HINT}><ChipBadge chip={link} /></div>
    </a>
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

// Spend and revenue share a currency, so both fit one axis and the gap between
// them reads directly. The number of sales is in the tooltip.
function DailyChart({ data, cur }: { data: DayPoint[]; cur: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: INK.primary, margin: 0 }}>Potrošnja i prodaja po danu, 14 punih dana</p>
        <Legend items={[{ key: "spend", label: "Potrošnja", color: SPEND_LINE }, { key: "revenue", label: "Prihod od prodaje (Meta)", color: REVENUE_LINE }]} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} interval={1} />
          <YAxis tick={{ fontSize: 11, fill: INK.muted }} axisLine={false} tickLine={false} width={46} />
          <Tooltip
            cursor={{ stroke: INK.border }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as DayPoint | undefined) : undefined;
              if (!d) return null;
              return (
                <TooltipBox
                  title={dayLabel(d.date)}
                  rows={[
                    { key: "spend", label: "Potrošnja", value: money(d.spend, cur), color: SPEND_LINE },
                    { key: "revenue", label: "Prihod od prodaje", value: money(d.revenue, cur), color: REVENUE_LINE },
                    { key: "purchases", label: "Broj prodaja", value: count(d.purchases) },
                  ]}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="spend" stroke={SPEND_LINE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="revenue" stroke={REVENUE_LINE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AdsetRows({ adset, cur }: { adset: AdsetReport; cur: string }) {
  const sub: React.CSSProperties = { ...td, padding: "7px 10px", fontSize: 12.5 };
  return (
    <>
      <tr style={{ background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}` }}>
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
        <tr key={ad.id} style={{ background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}` }}>
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
      <tr style={{ borderBottom: `1px solid ${INK.grid}`, cursor: "pointer" }} onClick={() => setOpen((o) => !o)} className="hover:bg-zinc-50 dark:hover:bg-[var(--ui-subtle)]">
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
        <td style={td}>{count(c.metrics.purchases)}{c.metrics.leads > 0 && <span style={{ display: "block", fontSize: 11, color: INK.muted }}>{leadCount(c.metrics.leads)}</span>}</td>
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
                  {c.fatigued && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--tone-amber-deep)", background: "var(--tone-amber-2)", borderRadius: 4, padding: "1px 6px" }}>zamor</span>}
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

function AccountSection({ account: a }: { account: Account }) {
  const cur = a.currency;
  const m = a.metrics;
  const p = a.previous;
  const subtitle = [
    a.target_cpa !== null
      ? `Prag cene prodaje ${money(a.target_cpa, cur)}${a.target_estimated ? " (procena: prosek naloga za 30 dana)" : ""}`
      : "Prag cene prodaje nije određen",
    a.synced_at ? `osveženo u ${timeLabel(a.synced_at)}` : "još nije sinhronizovano",
  ].filter(Boolean).join(" · ");

  return (
    <section id={`nalog-${a.id}`} style={{ scrollMarginTop: 16 }}>
      <ChartCard title={a.name} subtitle={subtitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {a.error && (
            <p style={{ fontSize: 12, color: RED, background: "var(--tone-red-1)", borderRadius: 8, padding: "8px 12px", margin: 0 }}>
              Poslednje osvežavanje nije uspelo, brojke mogu da kasne: {a.error}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 12, color: INK.muted }}>Ocena za 7 dana:</span><VerdictBadge verdict={a.verdict} withReason /></span>
            {p && <span style={{ fontSize: 12, color: INK.muted }}>Procenti: promena u odnosu na prethodni isti period</span>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gap: 8 }}>
            <Stat label="Potrošnja" value={money(m.spend, cur)} delta={<Delta now={m.spend} before={p?.spend} />} />
            <Stat label="Prodaje" value={count(m.purchases)} delta={<Delta now={m.purchases} before={p?.purchases} goodWhenUp />} hint={m.leads ? leadCount(m.leads) : undefined} />
            <Stat label="Prihod po Meta" value={money(m.revenue, cur)} delta={<Delta now={m.revenue} before={p?.revenue} goodWhenUp />} />
            <Stat label="Cena prodaje (CPA)" value={money(m.cpa, cur)} delta={<Delta now={m.cpa} before={p?.cpa} />} />
            <Stat label="ROAS po Meta" value={times(m.roas)} delta={<Delta now={m.roas} before={p?.roas} goodWhenUp />} hint={a.orderly_roas.period === null ? undefined : `Orderly ${times(a.orderly_roas.period)}`} />
            <Stat label="CTR / CPM" value={percent(m.ctr)} hint={`CPM ${money(m.cpm, cur)}`} />
          </div>

          <Funnel m={m} cur={cur} />

          <DailyChart data={a.daily} cur={cur} />

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
                      <th style={{ ...th, textAlign: "left" }}>Ocena (7 dana)</th>
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
            <AdList title="Oglasi koji rade najbolje, poslednjih 7 punih dana" empty="Nijedan oglas nema prodaju uz dovoljno potrošnje u poslednjih 7 dana." items={a.best_ads} cur={cur} />
            <AdList title="Oglasi koji ne rade, poslednjih 7 punih dana" empty="Nema oglasa sa lošim rezultatom u poslednjih 7 dana." items={a.worst_ads} cur={cur} />
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
  skaliraj: { label: "Skaliraj", color: "var(--tone-green-strong)", bg: "var(--tone-green-2)" },
  ugasi: { label: "Ugasi", color: RED, bg: "var(--tone-red-2)" },
  osvezi_kreativu: { label: "Osveži kreativu", color: "var(--tone-amber-deep)", bg: "var(--tone-amber-2)" },
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
                  style={{ flexShrink: 0, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 8, border: `1px solid ${INK.border}`, background: "var(--ui-surface)", color: INK.primary, cursor: "pointer", opacity: saving === r.id ? 0.5 : 1 }}
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
  const { data, error, isLoading, mutate } = useSWR<LiveData>(`/api/ads/live?period=${period}`, jsonFetcher, { refreshInterval: 60_000, keepPreviousData: true });
  const cur = data?.base_currency ?? "EUR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: INK.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>Reklame</h1>
        <p style={{ fontSize: 13, color: INK.muted, margin: "4px 0 0" }}>
          {data?.synced_at ? `Meta podaci osveženi u ${timeLabel(data.synced_at)}` : "Meta kampanje po nalozima"}
        </p>
      </div>

      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : !data ? (
        <div style={{ height: 320, background: INK.grid, borderRadius: 12 }} className={isLoading ? "animate-pulse" : undefined} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 14 }}>
            {data.accounts.map((a) => <AccountCardTile key={a.id} account={a} />)}
          </div>

          <Recommendations items={data.recommendations} onDone={() => mutate()} />

          {data.unmapped_spending > 0 && (
            <p style={{ fontSize: 13, color: "var(--tone-amber-deep)", background: "var(--tone-amber-2)", borderRadius: 8, padding: "10px 14px", margin: 0 }}>
              Kampanja sa potrošnjom koje nisu povezane sa sajtom: {data.unmapped_spending}. Za njih nema stvarnog ROAS-a i ne ulaze u profit. Povezuje se u Podešavanja → Facebook Ads.
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: INK.primary, margin: 0 }}>Svi nalozi</h2>
              <p style={{ fontSize: 12, color: INK.muted, margin: "2px 0 0" }}>
                Orderly neto za izabrani period, svi sajtovi: {money(data.net, cur, 0)}, {times(data.real_roas)} u odnosu na potrošnju. Tu ulazi i prodaja koja nije od reklama.
              </p>
            </div>
            <Segmented label="Period" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
          </div>

          {data.accounts.map((a) => <AccountSection key={a.id} account={a} />)}
        </>
      )}
    </div>
  );
}
