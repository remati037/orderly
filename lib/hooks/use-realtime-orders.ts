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
  // enriched
  site_name: string;
  site_color: string;
  product_name: string | null;
  is_late: boolean; // true when created_at is not today (delayed webhook)
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

// ── helpers ────────────────────────────────────────────────────────────────────

interface StoredData {
  date: string;
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

function isOrderFromToday(createdAt: string): boolean {
  return new Date(createdAt).toISOString().slice(0, 10) === todayDateStr();
}

function readStorage(): RealtimeOrder[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: StoredData = JSON.parse(raw);
    if (stored.date !== todayDateStr()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored.orders;
  } catch {
    return null;
  }
}

function writeStorage(orders: RealtimeOrder[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayDateStr(), orders }));
  } catch {
    // sessionStorage unavailable — skip silently
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

  // Ref lets Effect 2 know whether Effect 1 already populated state from cache.
  // Refs update synchronously so Effect 2 sees the correct value even though
  // both effects have [] deps and run in declaration order.
  const loadedFromCache = useRef(false);

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
      // Non-fatal
    }
  }, []);

  function enrichFromCache(
    row: Record<string, unknown>,
    siteId: string
  ): Omit<RealtimeOrder, "product_name" | "is_late"> {
    const info = sitesCache.current.get(siteId);
    return {
      ...(row as Omit<RealtimeOrder, "site_name" | "site_color" | "product_name" | "is_late">),
      site_name: info?.name ?? "Unknown",
      site_color: info?.color_hex ?? "#888888",
    };
  }

  // ── Effect 1: Read sessionStorage synchronously on mount ──────────────────────
  useEffect(() => {
    const cached = readStorage();
    if (cached && cached.length > 0) {
      setRecentOrders(cached);
      loadedFromCache.current = true;
    }
  }, []);

  // ── Effect 2: Load sites + fetch today's orders if no cache ───────────────────
  useEffect(() => {
    async function init() {
      if (loadedFromCache.current) {
        // Cache hit — still need sites for realtime enrichment, but skip DB fetch
        await loadSites();
        return;
      }

      await loadSites();

      const { data } = await supabaseBrowser
        .from("orders")
        .select("*, sites(name, color_hex), order_items(product_name)")
        .gte("created_at", startOfTodayISO())
        .order("created_at", { ascending: false })
        .limit(MAX_ORDERS);

      if (data && data.length > 0) {
        const orders: RealtimeOrder[] = data.map((row) => {
          const sites = row.sites as { name: string; color_hex: string } | null;
          const items = row.order_items as Array<{ product_name: string }> | null;
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
            product_name: items?.[0]?.product_name ?? null,
            is_late: false, // initial fetch is always today
          };
        });
        setRecentOrders(orders);
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 3: Realtime channel — isolated, empty deps, never re-runs ──────────
  useEffect(() => {
    const channel = supabaseBrowser
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          console.log("Realtime event: INSERT orders", payload);
          const newRow = payload.new as Record<string, unknown>;
          const siteId = newRow.site_id as string;
          const createdAt = newRow.created_at as string;

          const order: RealtimeOrder = {
            ...enrichFromCache(newRow, siteId),
            product_name: null, // fetched async below
            is_late: !isOrderFromToday(createdAt),
          };

          setRecentOrders((prev) => {
            if (prev.some((o) => o.id === order.id)) return prev;
            return [order, ...prev].slice(0, MAX_ORDERS);
          });
          setNewOrderCount((n) => n + 1);
          onNewOrderRef.current?.(order);

          // Fetch product name and patch state once available
          supabaseBrowser
            .from("order_items")
            .select("product_name")
            .eq("order_id", order.id)
            .limit(1)
            .maybeSingle()
            .then(({ data: item }) => {
              if (item?.product_name) {
                setRecentOrders((prev) =>
                  prev.map((o) =>
                    o.id === order.id
                      ? { ...o, product_name: item.product_name }
                      : o
                  )
                );
              }
            });
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

    return () => {
      console.log("Realtime: removing orders-realtime channel");
      supabaseBrowser.removeChannel(channel);
    };
  }, []); // ← empty deps — this effect must never re-run

  // ── Effect 4: Persist to sessionStorage ───────────────────────────────────────
  useEffect(() => {
    if (recentOrders.length > 0) {
      writeStorage(recentOrders);
    }
  }, [recentOrders]);

  const clearNewCount = useCallback(() => setNewOrderCount(0), []);

  return { recentOrders, newOrderCount, clearNewCount };
}
