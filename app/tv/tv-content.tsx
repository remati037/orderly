"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser-client";
import { useRealtimeOrders, RealtimeOrder } from "@/lib/hooks/use-realtime-orders";
import { TVSoundProvider } from "@/lib/contexts/sound-context";
import { formatCurrency } from "@/lib/utils/currency";
import { toBase } from "@/lib/utils/fx";
import {
  BarChart,
  Bar,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

interface Site {
  id: string;
  name: string;
  color_hex: string;
}

interface HourlyBar {
  hour: string;
  revenue: number;
  current: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  completed:  "#22c55e",
  processing: "#f59e0b",
  pending:    "#6b7280",
  cancelled:  "#ef4444",
  refunded:   "#8b5cf6",
  failed:     "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  completed:  "Završeno",
  processing: "Obrada",
  pending:    "Na čekanju",
  cancelled:  "Otkazano",
  refunded:   "Refund",
  failed:     "Greška",
};

function padTwo(n: number) {
  return String(n).padStart(2, "0");
}

function clockStr(d: Date) {
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`;
}

function dateStr(d: Date) {
  return `${padTwo(d.getDate())}.${padTwo(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function orderTimeStr(iso: string) {
  const d = new Date(iso);
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

function buildHourlyBars(
  orders: RealtimeOrder[],
  rates: Record<string, number>,
  siteId: string | null
): HourlyBar[] {
  const currentHour = new Date().getHours();
  const relevant = siteId ? orders.filter((o) => o.site_id === siteId) : orders;
  const bars: HourlyBar[] = [];

  for (let h = 0; h <= currentHour; h++) {
    const revenue = relevant
      .filter((o) => {
        if (["cancelled", "refunded"].includes(o.status)) return false;
        return new Date(o.created_at).getHours() === h;
      })
      .reduce((s, o) => s + toBase(o.total, o.currency, rates), 0);

    bars.push({ hour: `${padTwo(h)}`, revenue, current: h === currentHour });
  }

  return bars;
}

export default function TVContent() {
  return (
    <TVSoundProvider>
      <TVContentInner />
    </TVSoundProvider>
  );
}

function TVContentInner() {
  const searchParams = useSearchParams();
  const urlSite = searchParams.get("site");
  const urlGlobal = searchParams.get("global") === "true";

  // Live clock
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // Config from Supabase
  const [sites, setSites] = useState<Site[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [fxRates, setFxRates] = useState<Record<string, number>>({ EUR: 1, RSD: 0.00855, USD: 0.92 });
  const [rotationSec, setRotationSec] = useState(30);
  const [dailyGoal, setDailyGoal] = useState<number | null>(null);
  const [anomalyHours, setAnomalyHours] = useState(3);

  useEffect(() => {
    async function load() {
      const [sitesRes, settingsRes] = await Promise.all([
        supabaseBrowser
          .from("sites")
          .select("id, name, color_hex")
          .eq("is_active", true)
          .order("created_at"),
        supabaseBrowser.from("settings").select("key, value"),
      ]);

      if (sitesRes.data) setSites(sitesRes.data);

      for (const row of settingsRes.data ?? []) {
        switch (row.key) {
          case "base_currency":
            setBaseCurrency(row.value as string);
            break;
          case "exchange_rates":
            setFxRates(row.value as Record<string, number>);
            break;
          case "rotation_interval":
            setRotationSec(Number(row.value) || 30);
            break;
          case "daily_goal":
            setDailyGoal(Number(row.value) || null);
            break;
          case "anomaly_hours_threshold":
            setAnomalyHours(Number(row.value) || 3);
            break;
        }
      }
    }
    load();
  }, []);

  // Realtime orders
  const { recentOrders, isConnected } = useRealtimeOrders();

  // Slide rotation
  const slides: Array<string | null> = useMemo(
    () => [null, ...sites.map((s) => s.id)],
    [sites]
  );
  const [slideIdx, setSlideIdx] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (urlSite || urlGlobal || slides.length <= 1) return;
    rotationRef.current = setInterval(() => {
      setSlideIdx((i) => (i + 1) % slides.length);
      setFadeKey((k) => k + 1);
    }, rotationSec * 1_000);
    return () => {
      if (rotationRef.current) clearInterval(rotationRef.current);
    };
  }, [slides, rotationSec, urlSite, urlGlobal]);

  const activeSiteId: string | null = urlSite
    ? urlSite
    : urlGlobal
    ? null
    : (slides[slideIdx] ?? null);

  const activeSite = activeSiteId ? sites.find((s) => s.id === activeSiteId) ?? null : null;

  // Derived data
  const filteredOrders = useMemo(() => {
    const valid = recentOrders.filter((o) => !["cancelled", "refunded"].includes(o.status));
    return activeSiteId ? valid.filter((o) => o.site_id === activeSiteId) : valid;
  }, [recentOrders, activeSiteId]);

  const revenueToday = useMemo(
    () => filteredOrders.reduce((s, o) => s + toBase(o.total, o.currency, fxRates), 0),
    [filteredOrders, fxRates]
  );

  const ordersToday = filteredOrders.length;
  const goalPct = dailyGoal && dailyGoal > 0
    ? Math.min(100, Math.round((revenueToday / dailyGoal) * 100))
    : null;

  const hourlyBars = useMemo(
    () => buildHourlyBars(recentOrders, fxRates, activeSiteId),
    [recentOrders, fxRates, activeSiteId]
  );

  const feedOrders = useMemo(() => {
    const src = activeSiteId
      ? recentOrders.filter((o) => o.site_id === activeSiteId)
      : recentOrders;
    return src.slice(0, 10);
  }, [recentOrders, activeSiteId]);

  // Anomaly detection
  const [showAnomaly, setShowAnomaly] = useState(false);
  useEffect(() => {
    const h = now.getHours();
    if (h < 8 || h >= 22) { setShowAnomaly(false); return; }

    if (filteredOrders.length === 0) {
      const workdayStart = new Date(now);
      workdayStart.setHours(8, 0, 0, 0);
      setShowAnomaly((now.getTime() - workdayStart.getTime()) / 3_600_000 >= anomalyHours);
      return;
    }

    const msSinceLast = now.getTime() - new Date(filteredOrders[0].created_at).getTime();
    setShowAnomaly(msSinceLast / 3_600_000 >= anomalyHours);
  }, [filteredOrders, now, anomalyHours]);

  // Ticker text
  const tickerOrders = useMemo(
    () => (activeSiteId ? recentOrders.filter((o) => o.site_id === activeSiteId) : recentOrders).slice(0, 20),
    [recentOrders, activeSiteId]
  );
  const tickerText = tickerOrders
    .map((o) => {
      const amt = formatCurrency(toBase(o.total, o.currency, fxRates), baseCurrency);
      return `${o.customer_name ?? "Anonimno"}  ·  ${o.product_name ?? o.site_name}  ·  ${amt}`;
    })
    .join("          ●          ");

  return (
    <div className="relative flex flex-col h-screen bg-[#09090B] text-white overflow-hidden select-none">
      {/* Fade-in wrapper resets on slide change */}
      <div
        key={fadeKey}
        className="flex flex-col h-full"
        style={{ animation: "tv-fade-in 0.7s ease-in-out" }}
      >
        {/* ── Top bar ─────────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-8 py-4 border-b border-white/10 shrink-0">
          <span className="text-xl font-bold tracking-widest text-white/90 uppercase">
            Orderly
          </span>

          <div className="flex items-center gap-3">
            {activeSite ? (
              <>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: activeSite.color_hex }}
                />
                <span className="text-lg font-semibold text-white/90">
                  {activeSite.name}
                </span>
              </>
            ) : (
              <span className="text-lg font-semibold text-white/50">
                Svi sajtovi
              </span>
            )}
          </div>

          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: isConnected ? "#22c55e" : "#ef4444",
                  boxShadow: isConnected ? "0 0 6px #22c55e88" : "0 0 6px #ef444488",
                }}
              />
              <span className={isConnected ? "text-green-400" : "text-red-400"}>
                {isConnected ? "LIVE" : "OFFLINE"}
              </span>
            </div>
            <span
              className="text-3xl font-mono font-bold tabular-nums tracking-tight"
              suppressHydrationWarning
            >
              {clockStr(now)}
            </span>
            <span className="text-xs text-white/40" suppressHydrationWarning>
              {dateStr(now)}
            </span>
          </div>
        </header>

        {/* ── KPI row ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5 px-8 py-5 shrink-0">
          {/* Revenue */}
          <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
              Prihod danas
            </p>
            <p
              className="font-bold tabular-nums leading-none text-white"
              style={{ fontSize: "clamp(28px, 3.5vw, 52px)" }}
              suppressHydrationWarning
            >
              {formatCurrency(revenueToday, baseCurrency)}
            </p>
          </div>

          {/* Orders */}
          <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
              Porudžbine danas
            </p>
            <p
              className="font-bold tabular-nums leading-none text-white"
              style={{ fontSize: "clamp(28px, 3.5vw, 52px)" }}
            >
              {ordersToday}
            </p>
          </div>

          {/* Goal or AOV */}
          <div className="bg-white/5 rounded-2xl border border-white/10 px-6 py-5">
            {goalPct !== null ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
                  Dnevni cilj
                </p>
                <p
                  className="font-bold tabular-nums leading-none text-white mb-4"
                  style={{ fontSize: "clamp(28px, 3.5vw, 52px)" }}
                >
                  {goalPct}%
                </p>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${goalPct}%`,
                      backgroundColor:
                        goalPct >= 100 ? "#22c55e" : goalPct >= 70 ? "#f59e0b" : "#3b82f6",
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
                  Prosečna vrednost
                </p>
                <p
                  className="font-bold tabular-nums leading-none text-white"
                  style={{ fontSize: "clamp(28px, 3.5vw, 52px)" }}
                  suppressHydrationWarning
                >
                  {ordersToday > 0
                    ? formatCurrency(revenueToday / ordersToday, baseCurrency)
                    : "—"}
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Main: Feed + Chart ───────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 gap-5 px-8 pb-5">
          {/* Live feed — 60% */}
          <div className="flex-[3] flex flex-col bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-3 border-b border-white/10 shrink-0">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                Poslednje porudžbine
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              {feedOrders.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/30 text-lg">
                  Nema porudžbina danas
                </div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {feedOrders.map((order, i) => {
                      const color = STATUS_COLORS[order.status] ?? "#6b7280";
                      const label = STATUS_LABELS[order.status] ?? order.status;
                      const amt = formatCurrency(
                        toBase(order.total, order.currency, fxRates),
                        baseCurrency
                      );
                      return (
                        <tr
                          key={order.id}
                          className="border-b border-white/5 last:border-0"
                          style={{ animation: `tv-row-in 0.3s ease-out ${i * 25}ms both` }}
                        >
                          <td className="px-6 py-3.5 text-white/35 tabular-nums font-mono text-xs w-14 shrink-0">
                            {orderTimeStr(order.created_at)}
                          </td>
                          <td className="px-3 py-3.5 max-w-[160px]">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: order.site_color }}
                              />
                              <span className="text-white/80 truncate">
                                {order.customer_name ?? "Anonimno"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-white/50 truncate max-w-[220px]">
                            {order.product_name ?? order.site_name}
                          </td>
                          <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-white text-base">
                            {amt}
                          </td>
                          <td className="px-6 py-3.5 text-right w-28 shrink-0">
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: `${color}22`,
                                color,
                                border: `1px solid ${color}44`,
                              }}
                            >
                              {label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Hourly chart — 40% */}
          <div className="flex-[2] flex flex-col bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-3 border-b border-white/10 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
                Prihod po satu — danas
              </span>
            </div>

            <div className="flex-1 p-4 min-h-0">
              {hourlyBars.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/30 text-sm">
                  Nema podataka
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hourlyBars}
                    margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
                  >
                    <XAxis
                      dataKey="hour"
                      tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis hide />
                    <Bar dataKey="revenue" radius={[3, 3, 0, 0]} maxBarSize={40}>
                      {hourlyBars.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.current ? "#3b82f6" : "rgba(255,255,255,0.12)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom ticker ────────────────────────────────────────────────────── */}
        {tickerOrders.length > 0 && (
          <div className="shrink-0 h-9 border-t border-white/10 bg-white/[0.03] overflow-hidden flex items-center">
            <div
              className="inline-flex whitespace-nowrap"
              style={{ animation: "tv-marquee 60s linear infinite" }}
            >
              <span className="text-xs text-white/40 tracking-wide px-8">
                {tickerText}
              </span>
              <span className="text-xs text-white/40 tracking-wide px-8" aria-hidden>
                {tickerText}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Anomaly alert overlay ────────────────────────────────────────────── */}
      {showAnomaly && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center bg-red-950/80 rounded-3xl border border-red-800/60 px-16 py-12">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-3xl font-bold text-red-300 mb-2">
              Nema porudžbina
            </p>
            <p className="text-lg text-red-400/80">
              Poslednja porudžbina pre više od {anomalyHours}h
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
