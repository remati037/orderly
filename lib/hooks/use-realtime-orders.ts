"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser-client";

// ── types ──────────────────────────────────────────────────────────────────────

export interface RealtimeOrder {
  id: string;
  site_id: string;
  woo_order_id: string | null;
  source: string;
  status: string;
  total: number;
  net_profit: number | null;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_city: string | null;
  product_type: string;
  payment_type: string;
  created_at: string;
  updated_at: string | null;
  // enriched from sites join
  site_name: string;
  site_color: string;
}

interface SiteInfo {
  name: string;
  color_hex: string;
}

interface UseRealtimeOrdersOptions {
  onNewOrder?: (order: RealtimeOrder) => void;
}

const MAX_ORDERS = 50;
const STORAGE_KEY = "livefeed_orders";

// ── session storage helpers ────────────────────────────────────────────────────

interface StoredData {
  date: string; // "YYYY-MM-DD" — used to detect day change
  orders: RealtimeOrder[];
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function readStorage(): RealtimeOrder[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: StoredData = JSON.parse(raw);
    if (stored.date !== todayDateStr()) {
      sessionStorage.removeItem(STORAGE_KEY); // stale — clear it
      return null;
    }
    return stored.orders;
  } catch {
    return null;
  }
}

function writeStorage(orders: RealtimeOrder[]): void {
  try {
    const data: StoredData = { date: todayDateStr(), orders };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage unavailable (private browsing, storage full) — skip silently
  }
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useRealtimeOrders({
  onNewOrder,
}: UseRealtimeOrdersOptions = {}) {
  const [recentOrders, setRecentOrders] = useState<RealtimeOrder[]>([]);
  const [newOrderCount, setNewOrderCount] = useState(0);

  const sitesCache = useRef<Map<string, SiteInfo>>(new Map());
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/sites");
      if (!res.ok) return;
      const sites: Array<{ id: string; name: string; color_hex: string }> =
        await res.json();
      const map = new Map<string, SiteInfo>();
      for (const site of sites) {
        map.set(site.id, { name: site.name, color_hex: site.color_hex });
      }
      sitesCache.current = map;
    } catch {
      // Non-fatal — realtime events will show "Unknown" for site name
    }
  }, []);

  function enrich(row: Record<string, unknown>, siteId: string): RealtimeOrder {
    const info = sitesCache.current.get(siteId);
    return {
      ...(row as Omit<RealtimeOrder, "site_name" | "site_color">),
      site_name: info?.name ?? "Unknown",
      site_color: info?.color_hex ?? "#888888",
    };
  }

  // Persist to sessionStorage whenever the orders list changes
  useEffect(() => {
    if (recentOrders.length > 0) {
      writeStorage(recentOrders);
    }
  }, [recentOrders]);

  useEffect(() => {
    // ── Start channel synchronously first ──────────────────────────────────────
    // This ensures no INSERT events are dropped during the async init below.
    const channel = supabaseBrowser
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          console.log("Realtime event: INSERT orders", payload);
          const newRow = payload.new as Record<string, unknown>;
          const order = enrich(newRow, newRow.site_id as string);

          setRecentOrders((prev) => {
            // Deduplicate — guard against the race window between initial fetch
            // completing and the realtime subscription becoming active
            if (prev.some((o) => o.id === order.id)) return prev;
            return [order, ...prev].slice(0, MAX_ORDERS);
          });
          setNewOrderCount((n) => n + 1);
          onNewOrderRef.current?.(order);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          console.log("Realtime event: UPDATE orders", payload);
          const updated = payload.new as Record<string, unknown>;
          const id = updated.id as string;
          const nextStatus = updated.status as string;

          setRecentOrders((prev) =>
            prev.map((o) => (o.id === id ? { ...o, status: nextStatus } : o))
          );
        }
      )
      .subscribe((status, err) => {
        console.log("Realtime status:", status);
        if (err) console.error("Realtime subscription error:", err);
      });

    console.log("Realtime: subscribed to orders-realtime channel");

    // ── Async init: sessionStorage → DB fallback ───────────────────────────────
    async function init() {
      const cached = readStorage();
      if (cached && cached.length > 0) {
        setRecentOrders(cached);
        // Still need loadSites — realtime INSERT events use sitesCache for enrichment
        await loadSites();
        return;
      }

      // No valid cache — load sites then fetch today's orders from DB
      await loadSites();

      const { data } = await supabaseBrowser
        .from("orders")
        .select("*, sites(name, color_hex)")
        .gte("created_at", startOfTodayISO())
        .order("created_at", { ascending: false })
        .limit(MAX_ORDERS);

      if (data && data.length > 0) {
        const orders: RealtimeOrder[] = data.map((row) => {
          const sites = row.sites as { name: string; color_hex: string } | null;
          return {
            id: row.id,
            site_id: row.site_id,
            woo_order_id: row.woo_order_id ?? null,
            source: row.source,
            status: row.status,
            total: row.total,
            net_profit: row.net_profit ?? null,
            currency: row.currency,
            customer_name: row.customer_name ?? null,
            customer_email: row.customer_email ?? null,
            customer_city: row.customer_city ?? null,
            product_type: row.product_type,
            payment_type: row.payment_type,
            created_at: row.created_at,
            updated_at: row.updated_at ?? null,
            site_name: sites?.name ?? "Unknown",
            site_color: sites?.color_hex ?? "#888888",
          };
        });
        setRecentOrders(orders);
      }
    }

    init();

    return () => {
      console.log("Realtime: removing orders-realtime channel");
      supabaseBrowser.removeChannel(channel);
    };
    // singleton client + stable loadSites — effect must only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearNewCount = useCallback(() => setNewOrderCount(0), []);

  return { recentOrders, newOrderCount, clearNewCount };
}
