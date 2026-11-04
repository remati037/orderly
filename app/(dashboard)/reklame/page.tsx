"use client";

import { useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/hooks/json-fetcher";
import { LoadError } from "@/components/dashboard/load-error";
import { ChartCard, INK, pct } from "@/components/dashboard/analytics/chart-kit";

type Flag = "no_purchase" | "cpa_high" | null;

interface Campaign {
  campaign_id: string; name: string; active: boolean; site_name: string | null;
  spend_today: number; spend_yesterday: number; change: number | null;
  purchases_today: number; purchases_yesterday: number;
  cpa_today: number | null; roas_meta_today: number | null; real_roas_site: number | null; flag: Flag;
}
interface Account {
  id: string; name: string; currency: string; status: number | null; synced_at: string | null; error: string | null;
  target_cpa: number | null; target_estimated: boolean; campaigns: Campaign[];
}
interface Creative {
  ad_id: string; name: string; campaign_name: string | null; thumbnail_url: string | null;
  spend: number; purchases: number; cpa: number | null; ctr: number; frequency: number; fatigued: boolean;
}
interface DayTotals { spend: number; meta_revenue: number; purchases: number; net: number; real_roas: number | null }
interface Recommendation {
  id: string; created_at: string; account_name: string | null; level: string;
  entity_name: string | null; type: string; priority: number; text: string;
}
interface LiveData {
  base_currency: string;
  synced_at: string | null;
  black_friday: { name: string; from: string; to: string; counted: number; goal: number } | null;
  today: DayTotals;
  yesterday: DayTotals;
  accounts: Account[];
  creatives: { best: Creative[]; worst: Creative[] };
  unmapped_active: number;
  recommendations: Recommendation[];
}

const GREEN = "#16A34A";
const RED = "#DC2626";

const eur = (v: number | null, cur: string, digits = 0) =>
  v === null ? "—" : `${v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${cur === "EUR" ? "€" : cur}`;
const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

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

function BlackFriday({ data }: { data: NonNullable<LiveData["black_friday"]>; }) {
  const fill = data.goal > 0 ? Math.min(1, Math.max(0, data.counted / data.goal)) : 0;
  return (
    <ChartCard
      title={`${data.name}: napredak ka ${eur(data.goal, "EUR")}`}
      subtitle={<>Obračunski neto promet <strong style={{ color: INK.primary }}>{eur(data.counted, "EUR")}</strong> ({pct(fill, 1)}), isti obračun kao tab Black Friday</>}
    >
      <div style={{ height: 14, background: INK.grid, borderRadius: 7, overflow: "hidden" }}>
        <div style={{ width: `${fill * 100}%`, height: "100%", background: GREEN, borderRadius: 7, transition: "width 300ms" }} />
      </div>
    </ChartCard>
  );
}

const FLAG_LABEL: Record<NonNullable<Flag>, string> = { no_purchase: "bez kupovine", cpa_high: "CPA preko praga" };

const hasSpend = (c: Campaign) => c.spend_today > 0 || c.spend_yesterday > 0;

function AccountTable({ account, cur }: { account: Account; cur: string }) {
  // Old boosted posts stay ACTIVE on Meta without delivering; they'd bury the rest.
  const spending = account.campaigns.filter(hasSpend);
  const idle = account.campaigns.filter((c) => !hasSpend(c));
  const subtitle = [
    account.target_cpa !== null
      ? `Prag CPA ${eur(account.target_cpa, cur, 2)}${account.target_estimated ? " (procena: prosek 30 dana)" : ""}`
      : "Prag CPA nije određen",
    account.synced_at ? `sinhronizovano u ${timeLabel(account.synced_at)}` : "još nije sinhronizovano",
  ].join(" · ");

  return (
    <ChartCard title={account.name} subtitle={subtitle}>
      {account.error && (
        <p style={{ fontSize: 12, color: RED, background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", margin: "0 0 12px" }}>
          Poslednja sinhronizacija nije uspela: {account.error}
        </p>
      )}
      {spending.length === 0 ? (
        <p style={{ fontSize: 13, color: INK.muted, margin: 0 }}>Nema potrošnje danas ni juče.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${INK.grid}` }}>
                <th style={{ ...th, textAlign: "left" }}>Kampanja</th>
                <th style={th}>Danas</th>
                <th style={th}>Juče</th>
                <th style={th}>Promena</th>
                <th style={th}>Kupovine</th>
                <th style={th}>CPA</th>
                <th style={th}>ROAS Meta</th>
                <th style={th}>Stvarni ROAS sajta</th>
              </tr>
            </thead>
            <tbody>
              {spending.map((c) => (
                <tr key={c.campaign_id} style={{ borderBottom: `1px solid ${INK.grid}`, background: c.flag ? "#FEF2F2" : undefined }}>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 240 }}>
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    {!c.active && <span style={{ marginLeft: 8, fontSize: 11, color: INK.secondary, background: INK.grid, borderRadius: 4, padding: "1px 6px" }}>pauzirana</span>}
                    {c.flag && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: RED }}>{FLAG_LABEL[c.flag]}</span>}
                    <div style={{ fontSize: 12, color: INK.muted, marginTop: 2 }}>{c.site_name ?? "Nije povezana sa sajtom"}</div>
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{eur(c.spend_today, cur, 2)}</td>
                  <td style={td}>{eur(c.spend_yesterday, cur, 2)}</td>
                  <td style={{ ...td, color: INK.secondary }}>{c.change === null ? "—" : `${c.change > 0 ? "+" : ""}${pct(c.change, 0)}`}</td>
                  <td style={td}>{c.purchases_today}<span style={{ color: INK.muted }}> / {c.purchases_yesterday}</span></td>
                  <td style={{ ...td, color: c.flag === "cpa_high" ? RED : INK.primary, fontWeight: c.flag === "cpa_high" ? 600 : 400 }}>{eur(c.cpa_today, cur, 2)}</td>
                  <td style={td}>{x(c.roas_meta_today)}</td>
                  <td style={td}>{x(c.real_roas_site)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {idle.length > 0 && (
        <details style={{ marginTop: 12, fontSize: 13, color: INK.secondary }}>
          <summary style={{ cursor: "pointer" }}>Aktivne na Meta, bez potrošnje danas i juče: {idle.length}</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {idle.map((c) => <li key={c.campaign_id} style={{ overflowWrap: "anywhere" }}>{c.name}</li>)}
          </ul>
        </details>
      )}
    </ChartCard>
  );
}

function CreativeList({ title, items, cur }: { title: string; items: Creative[]; cur: string }) {
  return (
    <ChartCard title={title} subtitle="Aktivni oglasi, poslednjih 7 dana. Ulaze tek kad potroše prag CPA naloga.">
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: INK.muted, margin: 0 }}>Nema oglasa sa dovoljno potrošnje.</p>
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
                <p style={{ fontSize: 13, fontWeight: 500, color: INK.primary, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                  {c.fatigued && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#92400E", background: "#FEF3C7", borderRadius: 4, padding: "1px 6px" }}>zamor</span>}
                </p>
                <p style={{ fontSize: 12, color: INK.secondary, margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
                  CPA {c.cpa === null ? "nema kupovine" : eur(c.cpa, cur, 2)} · {eur(c.spend, cur)} · {c.purchases} kup. · frekv. {c.frequency.toFixed(2).replace(".", ",")} · CTR {c.ctr.toFixed(2).replace(".", ",")}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
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
  const { data, error, isLoading, mutate } = useSWR<LiveData>("/api/ads/live", jsonFetcher, { refreshInterval: 60_000 });
  const cur = data?.base_currency ?? "EUR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: INK.primary, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>Reklame</h1>
        <p style={{ fontSize: 13, color: INK.muted, margin: "4px 0 0" }}>
          {data?.synced_at ? `Meta podaci osveženi u ${timeLabel(data.synced_at)} · osvežava se na 15 minuta` : "Meta kampanje uživo"}
        </p>
      </div>

      {error && !data ? (
        <LoadError onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div style={{ height: 320, background: INK.grid, borderRadius: 12 }} className="animate-pulse" />
      ) : (
        <>
          {data.black_friday && <BlackFriday data={data.black_friday} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 12 }}>
            <Stat label="Potrošnja danas" value={eur(data.today.spend, cur)} hint={`Juče ${eur(data.yesterday.spend, cur)}`} />
            <Stat label="Prihod po Meta danas" value={eur(data.today.meta_revenue, cur)} hint={`${data.today.purchases} kup. · juče ${eur(data.yesterday.meta_revenue, cur)}`} />
            <Stat label="Stvarni neto prihod danas" value={eur(data.today.net, cur)} hint={`Juče ${eur(data.yesterday.net, cur)} · svi sajtovi, Orderly`} />
            <Stat label="Stvarni ROAS danas" value={x(data.today.real_roas)} hint={`Juče ${x(data.yesterday.real_roas)} · neto / potrošnja`} />
          </div>

          <Recommendations items={data.recommendations} onDone={() => mutate()} />

          {data.unmapped_active > 0 && (
            <p style={{ fontSize: 13, color: "#92400E", background: "#FEF3C7", borderRadius: 8, padding: "10px 14px", margin: 0 }}>
              Aktivnih kampanja koje nisu povezane sa sajtom: {data.unmapped_active}. Za njih nema stvarnog ROAS-a i ne ulaze u profit. Povezuje se u Podešavanja → Facebook Ads.
            </p>
          )}

          {data.accounts.map((a) => <AccountTable key={a.id} account={a} cur={cur} />)}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ gap: 16, alignItems: "start" }}>
            <CreativeList title="Najbolji oglasi" items={data.creatives.best} cur={cur} />
            <CreativeList title="Najgori oglasi" items={data.creatives.worst} cur={cur} />
          </div>

          <p style={{ fontSize: 12, color: INK.muted, margin: 0 }}>
            Današnji dan je nepun, pa je promena u odnosu na juče samo orijentir. Stvarni ROAS računa sav neto prihod, i onaj koji nije od reklama.
          </p>
        </>
      )}
    </div>
  );
}
