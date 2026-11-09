"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronRightIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { INK, Segmented } from "@/components/dashboard/analytics/chart-kit";
import { count, dayLabel, money, percent, td, th, times } from "@/components/ads/ui";
import type { AdAction, LibraryAd, LibraryAdset, LibraryCampaign, LibraryPeriod } from "@/lib/ads/library";
import type { Metrics } from "@/lib/ads/report";

interface LibraryAccount { id: string; name: string; label: string; color: number; currency: string; fb_account_id: string; target_cpa: number | null; target_estimated: boolean }
interface LibraryCampaignRow extends LibraryCampaign { spend_base: number }
interface LibraryData { period: LibraryPeriod; from: string; to: string; verdict_from: string; verdict_to: string; accounts: LibraryAccount[]; campaigns: LibraryCampaignRow[] }

const PERIOD_OPTIONS: { value: LibraryPeriod; label: string }[] = [
  { value: "today", label: "Danas" },
  { value: "yesterday", label: "Juče" },
  { value: "7d", label: "7 dana" },
  { value: "14d", label: "14 dana" },
  { value: "30d", label: "30 dana" },
];

const ACTION: Record<AdAction, { label: string; hint: string; color: string; bg: string }> = {
  push: { label: "Forsiraj", hint: "Radi i aktivan je: tu ide više budžeta i nove varijacije", color: "var(--tone-green-strong)", bg: "var(--tone-green-2)" },
  revive: { label: "Dobar, pauziran", hint: "Imao je dobar rezultat, a sada ne radi: kandidat da se pusti ponovo", color: "var(--tone-green-strong)", bg: "var(--tone-green-1, var(--tone-green-2))" },
  watch: { label: "Prati", hint: "Prodaje, ali skuplje od praga", color: "var(--tone-amber-deep)", bg: "var(--tone-amber-2)" },
  stop: { label: "Ugasi", hint: "Troši bez rezultata ili duplo iznad praga, a još je aktivan", color: "var(--tone-red-strong)", bg: "var(--tone-red-2)" },
  stopped: { label: "Loš, ugašen", hint: "Loš rezultat, već ne radi", color: INK.secondary, bg: INK.grid },
  early: { label: "Rano za ocenu", hint: "Potrošio je manje od praga cene prodaje", color: INK.secondary, bg: INK.grid },
  lead: { label: "Leadovi", hint: "Donosi leadove, ne prodaje", color: "var(--tone-blue-strong)", bg: "var(--tone-blue-2)" },
};
const ACTION_ORDER: AdAction[] = ["push", "revive", "watch", "stop", "stopped", "early", "lead"];

type SortKey = "spend" | "purchases" | "cpa" | "roas" | "ctr";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Potrošnja" },
  { key: "purchases", label: "Prodaje" },
  { key: "cpa", label: "Cena prod." },
  { key: "roas", label: "ROAS" },
  { key: "ctr", label: "CTR" },
];

const sortValue = (c: LibraryCampaignRow, key: SortKey): number | null => {
  switch (key) {
    case "spend": return c.spend_base;
    case "purchases": return c.metrics.purchases;
    // Spend per sale in base currency, so accounts in different currencies compare.
    case "cpa": return c.metrics.purchases > 0 ? c.spend_base / c.metrics.purchases : null;
    case "roas": return c.metrics.roas;
    case "ctr": return c.metrics.ctr;
  }
};

const adsManagerLink = (act: string, adId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act.replace(/^act_/, "")}&selected_ad_ids=${adId}`;

function ActionBadge({ action }: { action: AdAction }) {
  const a = ACTION[action];
  return <span title={a.hint} style={{ fontSize: 11, fontWeight: 600, color: a.color, background: a.bg, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{a.label}</span>;
}

function Thumb({ url, size }: { url: string | null; size: number }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <div style={{ width: size, height: size, borderRadius: 8, flexShrink: 0, background: INK.grid }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived Meta CDN URLs, not worth optimizing
    <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: INK.grid }} />
  );
}

// 1 ad set, 2–4 ad seta, 5+ ad setova (11–14 too).
const adsetCount = (n: number) => {
  const tens = n % 100, ones = n % 10;
  if (ones === 1 && tens !== 11) return `${n} ad set`;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? `${n} ad seta` : `${n} ad setova`;
};

// 1 kampanja, 2–4 kampanje, 5+ kampanja (11–14 too).
const campaignWord = (n: number) => {
  const tens = n % 100, ones = n % 10;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? "kampanje" : "kampanja";
};

const statusLabel = (status: string | null) =>
  status === "ACTIVE" ? "aktivan" : status === "DISAPPROVED" ? "odbijen" : "pauziran";

// One row per level, indented like Ads Manager: campaign, ad set, ad.
function MetricCells({ m, cur, frequency, style }: { m: Metrics; cur: string; frequency?: number; style: React.CSSProperties }) {
  return (
    <>
      <td style={{ ...style, fontWeight: style === td ? 600 : 400 }}>{money(m.spend, cur)}</td>
      <td style={style}>{count(m.purchases)}</td>
      <td style={style}>{money(m.cpa, cur)}</td>
      <td style={style}>{times(m.roas)}</td>
      <td style={style}>{percent(m.ctr)}</td>
      <td style={style}>{frequency === undefined ? "—" : frequency.toFixed(2).replace(".", ",")}</td>
    </>
  );
}

function ActionCell({ node, style }: { node: { action: AdAction; verdict: { reason: string } }; style: React.CSSProperties }) {
  return (
    <td style={{ ...style, textAlign: "left", whiteSpace: "normal", minWidth: 220 }}>
      <ActionBadge action={node.action} />
      <span style={{ display: "block", fontSize: 12, color: INK.secondary, marginTop: 4 }}>{node.verdict.reason}</span>
    </td>
  );
}

function Toggle({ open, onClick, indent, children }: { open: boolean; onClick: () => void; indent: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: `0 0 0 ${indent}px`, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
    >
      <ChevronRightIcon className="size-4" style={{ color: INK.muted, flexShrink: 0, transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }} aria-hidden />
      <span style={{ minWidth: 0 }}>{children}</span>
    </button>
  );
}

function AdRow({ ad, cur, account }: { ad: LibraryAd; cur: string; account: LibraryAccount | undefined }) {
  const sub: React.CSSProperties = { ...td, padding: "8px 10px", fontSize: 12.5 };
  return (
    <tr style={{ background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}` }}>
      <td style={{ ...sub, textAlign: "left", whiteSpace: "normal", paddingLeft: 58 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Thumb url={ad.thumbnail_url} size={44} />
          <span style={{ minWidth: 0 }}>
            <span style={{ color: INK.primary, fontWeight: 500, overflowWrap: "anywhere" }}>{ad.name}</span>
            <span style={{ display: "block", fontSize: 11.5, color: INK.muted }}>
              {statusLabel(ad.status)} · od {dayLabel(ad.first_seen)}
              {account && (
                <a href={adsManagerLink(account.fb_account_id, ad.id)} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: "var(--tone-blue-strong)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  Ads Manager <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              )}
            </span>
          </span>
        </span>
      </td>
      <MetricCells m={ad.metrics} cur={cur} frequency={ad.frequency} style={sub} />
      <ActionCell node={ad} style={sub} />
    </tr>
  );
}

function AdsetRows({ adset, cur, account }: { adset: LibraryAdset; cur: string; account: LibraryAccount | undefined }) {
  const [open, setOpen] = useState(false);
  const sub: React.CSSProperties = { ...td, padding: "8px 10px", fontSize: 12.5 };
  return (
    <>
      <tr style={{ background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}`, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <td style={{ ...sub, textAlign: "left", whiteSpace: "normal" }}>
          <Toggle open={open} onClick={() => setOpen((o) => !o)} indent={22}>
            <span style={{ fontWeight: 600, color: INK.primary, overflowWrap: "anywhere" }}>{adset.name}</span>
            <span style={{ display: "block", fontSize: 11.5, color: INK.muted }}>
              Ad set · {adset.ads.length === 1 ? "1 oglas" : `${adset.ads.length} oglasa`}{adset.active ? ` · aktivno ${adset.active_ads}` : " · ne radi"}
            </span>
          </Toggle>
        </td>
        <MetricCells m={adset.metrics} cur={cur} style={sub} />
        <ActionCell node={adset} style={sub} />
      </tr>
      {open && adset.ads.map((ad) => <AdRow key={ad.id} ad={ad} cur={cur} account={account} />)}
    </>
  );
}

// Solid fill with white text reads the same in light and dark mode. Green, red and
// amber stay out: they already mean good, bad and watch.
const ACCOUNT_COLORS = ["#2563EB", "#7C3AED", "#EA580C", "#0891B2", "#DB2777", "#4F46E5", "#0D9488"];
const accountColor = (a: LibraryAccount | undefined) => ACCOUNT_COLORS[(a?.color ?? 0) % ACCOUNT_COLORS.length];

function AccountChip({ account }: { account: LibraryAccount }) {
  return (
    <span title={account.name} style={{ display: "inline-block", fontSize: 13, fontWeight: 700, color: "#fff", background: accountColor(account), borderRadius: 6, padding: "3px 10px", whiteSpace: "nowrap" }}>
      {account.label}
    </span>
  );
}

// Totals of an account's campaigns on screen, summed the way metricsOf does.
function sumMetrics(list: Metrics[]): Metrics {
  const sum = (f: (m: Metrics) => number) => list.reduce((n, m) => n + f(m), 0);
  const spend = sum((m) => m.spend), purchases = sum((m) => m.purchases), revenue = sum((m) => m.revenue);
  const impressions = sum((m) => m.impressions), clicks = sum((m) => m.clicks), leads = sum((m) => m.leads);
  return {
    spend, purchases, revenue, impressions, clicks, leads,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 && !(purchases > 0 && revenue === 0) ? revenue / spend : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    landing_page_views: sum((m) => m.landing_page_views),
    add_to_cart: sum((m) => m.add_to_cart),
    initiate_checkout: sum((m) => m.initiate_checkout),
    cpl: leads > 0 ? spend / leads : null,
  };
}

function AccountHeader({ account, campaigns }: { account: LibraryAccount; campaigns: LibraryCampaignRow[] }) {
  const cell: React.CSSProperties = { ...td, fontWeight: 600, background: "var(--ui-sidebar)", borderTop: `2px solid ${accountColor(account)}` };
  const active = campaigns.filter((c) => c.active).length;
  return (
    <tr id={`nalog-${account.id}`}>
      <td style={{ ...cell, textAlign: "left", whiteSpace: "normal" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AccountChip account={account} />
          <span style={{ fontSize: 12, fontWeight: 400, color: INK.muted }}>
            {campaigns.length} {campaignWord(campaigns.length)}{active ? `, aktivno ${active}` : ""} · {account.currency}
          </span>
        </span>
      </td>
      <MetricCells m={sumMetrics(campaigns.map((c) => c.metrics))} cur={account.currency} style={cell} />
      <td style={{ ...cell, textAlign: "left", fontWeight: 400, fontSize: 12, color: INK.secondary }}>
        Prag cene prodaje {money(account.target_cpa, account.currency)}{account.target_estimated ? " (procena)" : ""}
      </td>
    </tr>
  );
}

function CampaignRows({ c, account }: { c: LibraryCampaignRow; account: LibraryAccount | undefined }) {
  const [open, setOpen] = useState(false);
  const cur = account?.currency ?? "EUR";
  return (
    <Fragment>
      <tr style={{ borderBottom: `1px solid ${INK.grid}`, cursor: "pointer" }} onClick={() => setOpen((o) => !o)} className="hover:bg-zinc-50 dark:hover:bg-[var(--ui-subtle)]">
        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 320, boxShadow: `inset 4px 0 0 ${accountColor(account)}`, paddingLeft: 14 }}>
          <Toggle open={open} onClick={() => setOpen((o) => !o)} indent={0}>
            <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{c.name}</span>
            {!c.active && <span style={{ marginLeft: 8, fontSize: 11, color: INK.secondary, background: INK.grid, borderRadius: 4, padding: "1px 6px" }}>ne radi</span>}
            <span style={{ display: "block", fontSize: 12, color: INK.muted, marginTop: 2 }}>
              {adsetCount(c.adsets.length)} · {c.ad_count === 1 ? "1 oglas" : `${c.ad_count} oglasa`}{c.active ? ` (aktivno ${c.active_ads})` : ""} · od {dayLabel(c.first_seen)}
            </span>
          </Toggle>
        </td>
        <MetricCells m={c.metrics} cur={cur} style={td} />
        <ActionCell node={c} style={td} />
      </tr>
      {open && c.adsets.map((s) => <AdsetRows key={s.id} adset={s} cur={cur} account={account} />)}
    </Fragment>
  );
}

// What the numbers cover, and what the verdicts look at when that differs.
function periodLine(d: LibraryData): string {
  const shown = d.from === d.to
    ? `Kampanje sa potrošnjom ${d.period === "today" ? "danas, do sada" : `juče, ${dayLabel(d.from)}`}.`
    : `Kampanje sa potrošnjom od ${dayLabel(d.from)} do ${dayLabel(d.to)}, samo puni dani.`;
  const judged = d.verdict_from !== d.from
    ? ` Ocena „šta raditi" gleda poslednjih 7 punih dana (${dayLabel(d.verdict_from)} do ${dayLabel(d.verdict_to)}), jer jedan dan nije dovoljan.`
    : "";
  return `${shown}${judged} `;
}

const control: React.CSSProperties = {
  fontSize: 13, padding: "7px 10px", borderRadius: 8, border: `1px solid ${INK.border}`, background: "var(--ui-surface)", color: INK.primary,
};

export default function SviOglasiPage() {
  const [period, setPeriod] = useState<LibraryPeriod>("7d");
  const [account, setAccount] = useState("all");
  const [action, setAction] = useState<AdAction | "all">("all");
  const [onlyActive, setOnlyActive] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "spend", desc: true });
  const { data, error, isLoading, mutate } = useSWR<LibraryData>(`/api/ads/library?period=${period}`, jsonFetcher, { refreshInterval: 300_000, keepPreviousData: true });

  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);

  // Counts follow the account, search and "only active" filters, not the action filter itself.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (name: string) => name.toLowerCase().includes(q);
    return (data?.campaigns ?? []).filter((c) =>
      (account === "all" || c.ad_account_id === account) &&
      (!onlyActive || c.active) &&
      (!q || hit(c.name) || c.adsets.some((s) => hit(s.name) || s.ads.some((a) => hit(a.name))))
    );
  }, [data, account, onlyActive, query]);

  const counts = useMemo(() => {
    const n = new Map<AdAction, number>();
    for (const c of base) n.set(c.action, (n.get(c.action) ?? 0) + 1);
    return n;
  }, [base]);

  const shown = useMemo(() => {
    const list = base.filter((c) => action === "all" || c.action === action);
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      if (x === null && y === null) return b.spend_base - a.spend_base;
      if (x === null) return 1;
      if (y === null) return -1;
      return sort.desc ? y - x : x - y;
    });
  }, [base, action, sort]);

  // Campaigns stay inside their account; accounts follow the account's total spend on screen.
  const groups = useMemo(() => {
    const byAccount = new Map<string, LibraryCampaignRow[]>();
    for (const c of shown) {
      const g = byAccount.get(c.ad_account_id);
      if (g) g.push(c);
      else byAccount.set(c.ad_account_id, [c]);
    }
    const total = (list: LibraryCampaignRow[]) => list.reduce((n, c) => n + c.spend_base, 0);
    return [...byAccount.entries()].sort(([, a], [, b]) => total(b) - total(a));
  }, [shown]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "cpa" }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: INK.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>Svi oglasi</h1>
          <p style={{ fontSize: 13, color: INK.muted, margin: "4px 0 0", maxWidth: 720 }}>
            {data ? periodLine(data) : ""}
            Klik na kampanju otvara ad setove, klik na ad set otvara oglase. Svaki nivo ima svoju ocenu.
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {ACTION_ORDER.filter((k) => counts.get(k)).map((k) => {
              const a = ACTION[k];
              const selected = action === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAction(selected ? "all" : k)}
                  title={a.hint}
                  style={{ textAlign: "left", cursor: "pointer", borderRadius: 10, padding: "12px 14px", background: selected ? a.bg : "var(--ui-surface)", border: `1px solid ${selected ? a.color : INK.border}`, font: "inherit" }}
                >
                  <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: a.color }}>{a.label}</span>
                  <span style={{ display: "block", fontSize: 24, fontWeight: 700, color: INK.primary, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{counts.get(k)}</span>
                  <span style={{ display: "block", fontSize: 11, color: INK.muted }}>{campaignWord(counts.get(k) ?? 0)}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
              <span className="sr-only">Pretraga</span>
              <SearchIcon className="size-4" aria-hidden style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: INK.muted }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kampanja, ad set ili oglas" style={{ ...control, width: "100%", paddingLeft: 32 }} />
            </label>
            <label>
              <span className="sr-only">Nalog</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)} style={control}>
                <option value="all">Svi nalozi</option>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: INK.secondary, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Samo aktivni
            </label>
            {action !== "all" && (
              <button type="button" onClick={() => setAction("all")} style={{ ...control, cursor: "pointer" }}>Prikaži sve ocene</button>
            )}
          </div>

          <div style={{ background: "var(--ui-surface)", border: `1px solid ${INK.border}`, borderRadius: 12, padding: "6px 6px 2px" }}>
            {shown.length === 0 ? (
              <p style={{ fontSize: 13, color: INK.muted, margin: 0, padding: 16 }}>Nema kampanja za ove filtere.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
                      <th style={{ ...th, textAlign: "left" }}>Kampanja ({shown.length})</th>
                      {SORTS.map((s) => (
                        <th key={s.key} style={th} aria-sort={sort.key === s.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                          <button type="button" onClick={() => toggleSort(s.key)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: sort.key === s.key ? INK.primary : INK.muted, letterSpacing: "inherit", textTransform: "inherit" }}>
                            {s.label}{sort.key === s.key ? (sort.desc ? " ↓" : " ↑") : ""}
                          </button>
                        </th>
                      ))}
                      <th style={th}>Frekv.</th>
                      <th style={{ ...th, textAlign: "left" }}>Šta raditi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([accountId, list]) => {
                      const acc = accounts.get(accountId);
                      return (
                        <Fragment key={accountId}>
                          {acc && <AccountHeader account={acc} campaigns={list} />}
                          {list.map((c) => <CampaignRows key={c.id} c={c} account={acc} />)}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: 12, color: INK.muted, margin: 0, lineHeight: 1.5 }}>
            Ocena po M4 pravilima, u odnosu na prag cene prodaje naloga: ispod 1x praga potrošnje je rano za ocenu, 2x praga bez prodaje ili cena prodaje duplo iznad praga je loše.
 Prag svakog naloga piše u njegovom redu. Iznosi su u valuti naloga. Čuva se poslednjih 30 dana, starije reklame se ovde ne vide.
          </p>
        </>
      )}
    </div>
  );
}
