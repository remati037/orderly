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
  // enriched from sites
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

// ── hook ───────────────────────────────────────────────────────────────────────

export function useRealtimeOrders({
  onNewOrder,
}: UseRealtimeOrdersOptions = {}) {
  const [recentOrders, setRecentOrders] = useState<RealtimeOrder[]>([]);
  const [newOrderCount, setNewOrderCount] = useState(0);

  // Stable ref so Realtime callbacks always see the latest sites cache
  const sitesCache = useRef<Map<string, SiteInfo>>(new Map());
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  // Fetch sites once and populate the cache
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
      // Non-fatal — orders will show without site enrichment
    }
  }, []);

  function enrich(
    row: Record<string, unknown>,
    siteId: string
  ): RealtimeOrder {
    const info = sitesCache.current.get(siteId);
    return {
      ...(row as Omit<RealtimeOrder, "site_name" | "site_color">),
      site_name: info?.name ?? "Unknown",
      site_color: info?.color_hex ?? "#888888",
    };
  }

  useEffect(() => {
    loadSites();

    const channel = supabaseBrowser
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          console.log("Realtime event: INSERT orders", payload);
          const newRow = payload.new as Record<string, unknown>;
          const siteId = newRow.site_id as string;
          const order = enrich(newRow, siteId);

          setRecentOrders((prev) => [order, ...prev].slice(0, MAX_ORDERS));
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
            prev.map((o) =>
              o.id === id ? { ...o, status: nextStatus } : o
            )
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
    // singleton client + stable loadSites — effect must only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearNewCount = useCallback(() => setNewOrderCount(0), []);

  return { recentOrders, newOrderCount, clearNewCount };
}
