"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronRightIcon, ExternalLinkIcon, SearchIcon } from "lucide-react";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { INK, Segmented } from "@/components/dashboard/analytics/chart-kit";
import { VerdictBadge, count, dayLabel, money, percent, td, th, times } from "@/components/ads/ui";
import type { AdAction, Creative, LibraryDays } from "@/lib/ads/library";

interface LibraryAccount { id: string; name: string; currency: string; fb_account_id: string; target_cpa: number | null; target_estimated: boolean }
interface LibraryCreative extends Creative { spend_base: number }
interface LibraryData { days: LibraryDays; from: string; to: string; accounts: LibraryAccount[]; creatives: LibraryCreative[] }

const DAY_OPTIONS: { value: LibraryDays; label: string }[] = [
  { value: 7, label: "7 dana" },
  { value: 14, label: "14 dana" },
  { value: 30, label: "30 dana" },
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

type SortKey = "spend" | "purchases" | "cpa" | "roas" | "ctr" | "frequency";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "spend", label: "Potrošnja" },
  { key: "purchases", label: "Prodaje" },
  { key: "cpa", label: "Cena prod." },
  { key: "roas", label: "ROAS" },
  { key: "ctr", label: "CTR" },
  { key: "frequency", label: "Frekv." },
];

const sortValue = (c: LibraryCreative, key: SortKey): number | null => {
  switch (key) {
    case "spend": return c.spend_base;
    case "purchases": return c.metrics.purchases;
    // Spend per sale in base currency, so accounts in different currencies compare.
    case "cpa": return c.metrics.purchases > 0 ? c.spend_base / c.metrics.purchases : null;
    case "roas": return c.metrics.roas;
    case "ctr": return c.metrics.ctr;
    case "frequency": return c.frequency;
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

function CreativeRow({ c, account }: { c: LibraryCreative; account: LibraryAccount | undefined }) {
  const [open, setOpen] = useState(false);
  const cur = account?.currency ?? "EUR";
  const m = c.metrics;
  const sub: React.CSSProperties = { ...td, padding: "7px 10px", fontSize: 12.5 };
  const toggle = () => setOpen((o) => !o);
  return (
    <Fragment>
      <tr style={{ borderBottom: `1px solid ${INK.grid}`, cursor: "pointer" }} onClick={toggle} className="hover:bg-zinc-50 dark:hover:bg-[var(--ui-subtle)]">
        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 300 }}>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
          >
            <ChevronRightIcon className="size-4" style={{ color: INK.muted, flexShrink: 0, transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }} aria-hidden />
            <Thumb url={c.thumbnail_url} size={44} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{c.name}</span>
              <span style={{ display: "block", fontSize: 12, color: INK.muted, marginTop: 2, overflowWrap: "anywhere" }}>
                {account?.name ?? ""} · {c.copies === 1 ? "1 oglas" : `${c.copies} kopije`}{c.active ? ` · aktivno ${c.active_copies}` : " · ne radi"} · od {dayLabel(c.first_seen)}
              </span>
            </span>
          </button>
        </td>
        <td style={{ ...td, fontWeight: 600 }}>{money(m.spend, cur)}</td>
        <td style={td}>{count(m.purchases)}</td>
        <td style={td}>{money(m.cpa, cur)}</td>
        <td style={td}>{times(m.roas)}</td>
        <td style={td}>{percent(m.ctr)}</td>
        <td style={td}>{c.frequency.toFixed(2).replace(".", ",")}</td>
        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 220 }}>
          <ActionBadge action={c.action} />
          <span style={{ display: "block", fontSize: 12, color: INK.secondary, marginTop: 4 }}>{c.verdict.reason}</span>
        </td>
      </tr>
      {open && (
        <>
          <tr style={{ background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}` }}>
            <td colSpan={8} style={{ ...sub, textAlign: "left", whiteSpace: "normal", paddingLeft: 40, color: INK.secondary }}>
              Kampanje: {c.campaigns.join(", ")}. Poslednja potrošnja {dayLabel(c.last_spend)}. Prodaje i ROAS su po Meta pikselu.
            </td>
          </tr>
          {c.instances.map((i) => (
            <tr key={i.ad_id} style={{ background: "var(--ui-sidebar)", borderBottom: `1px solid ${INK.grid}` }}>
              <td style={{ ...sub, textAlign: "left", whiteSpace: "normal", paddingLeft: 40 }}>
                <span style={{ color: INK.primary }}>{i.adset_name ?? "Ad set"}</span>
                <span style={{ marginLeft: 6, fontSize: 11, color: INK.muted }}>({i.status === "ACTIVE" ? "aktivan" : i.status === "DISAPPROVED" ? "odbijen" : "pauziran"})</span>
                <span style={{ display: "block", fontSize: 11.5, color: INK.muted, overflowWrap: "anywhere" }}>
                  {i.campaign_name}
                  {account && (
                    <a href={adsManagerLink(account.fb_account_id, i.ad_id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 8, color: "var(--tone-blue-strong)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      Ads Manager <ExternalLinkIcon className="size-3" aria-hidden />
                    </a>
                  )}
                </span>
              </td>
              <td style={sub}>{money(i.metrics.spend, cur)}</td>
              <td style={sub}>{count(i.metrics.purchases)}</td>
              <td style={sub}>{money(i.metrics.cpa, cur)}</td>
              <td style={sub}>{times(i.metrics.roas)}</td>
              <td style={sub}>{percent(i.metrics.ctr)}</td>
              <td style={sub}>—</td>
              <td style={{ ...sub, textAlign: "left" }}><VerdictBadge verdict={i.verdict} /></td>
            </tr>
          ))}
        </>
      )}
    </Fragment>
  );
}

const control: React.CSSProperties = {
  fontSize: 13, padding: "7px 10px", borderRadius: 8, border: `1px solid ${INK.border}`, background: "var(--ui-surface)", color: INK.primary,
};

export default function SviOglasiPage() {
  const [days, setDays] = useState<LibraryDays>(7);
  const [account, setAccount] = useState("all");
  const [action, setAction] = useState<AdAction | "all">("all");
  const [onlyActive, setOnlyActive] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "spend", desc: true });
  const { data, error, isLoading, mutate } = useSWR<LibraryData>(`/api/ads/library?days=${days}`, jsonFetcher, { refreshInterval: 300_000, keepPreviousData: true });

  const accounts = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a])), [data]);

  // Counts follow the account, search and "only active" filters, not the action filter itself.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.creatives ?? []).filter((c) =>
      (account === "all" || c.ad_account_id === account) &&
      (!onlyActive || c.active) &&
      (!q || c.name.toLowerCase().includes(q) || c.campaigns.some((n) => n.toLowerCase().includes(q)))
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

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "cpa" }));

  const targets = (data?.accounts ?? [])
    .filter((a) => account === "all" || a.id === account)
    .map((a) => `${a.name} ${money(a.target_cpa, a.currency)}${a.target_estimated ? " (procena)" : ""}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: INK.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>Svi oglasi</h1>
          <p style={{ fontSize: 13, color: INK.muted, margin: "4px 0 0", maxWidth: 720 }}>
            {data ? `Svaka kreativa sa potrošnjom od ${dayLabel(data.from)} do ${dayLabel(data.to)}, samo puni dani. ` : ""}
            Isti oglas kopiran u više ad setova ocenjuje se zajedno.
          </p>
        </div>
        <Segmented label="Period" value={days} options={DAY_OPTIONS} onChange={setDays} />
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
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <label style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
              <span className="sr-only">Pretraga</span>
              <SearchIcon className="size-4" aria-hidden style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: INK.muted }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ime oglasa ili kampanje" style={{ ...control, width: "100%", paddingLeft: 32 }} />
            </label>
            <label>
              <span className="sr-only">Nalog</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)} style={control}>
                <option value="all">Svi nalozi</option>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
              <p style={{ fontSize: 13, color: INK.muted, margin: 0, padding: 16 }}>Nema oglasa za ove filtere.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
                      <th style={{ ...th, textAlign: "left" }}>Oglas ({shown.length})</th>
                      {SORTS.map((s) => (
                        <th key={s.key} style={th} aria-sort={sort.key === s.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                          <button type="button" onClick={() => toggleSort(s.key)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: sort.key === s.key ? INK.primary : INK.muted, letterSpacing: "inherit", textTransform: "inherit" }}>
                            {s.label}{sort.key === s.key ? (sort.desc ? " ↓" : " ↑") : ""}
                          </button>
                        </th>
                      ))}
                      <th style={{ ...th, textAlign: "left" }}>Šta raditi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => <CreativeRow key={c.key} c={c} account={accounts.get(c.ad_account_id)} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p style={{ fontSize: 12, color: INK.muted, margin: 0, lineHeight: 1.5 }}>
            Ocena po M4 pravilima, u odnosu na prag cene prodaje naloga: ispod 1x praga potrošnje je rano za ocenu, 2x praga bez prodaje ili cena prodaje duplo iznad praga je loše.
            {targets.length > 0 && ` Pragovi: ${targets.join(", ")}.`} Iznosi su u valuti naloga. Čuva se poslednjih 30 dana, starije reklame se ovde ne vide.
          </p>
        </>
      )}
    </div>
  );
}
