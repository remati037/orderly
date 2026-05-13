"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser-client";
import { useSoundContext } from "@/lib/contexts/sound-context";

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
  is_late: boolean;
}

interface SiteInfo {
  name: string;
  color_hex: string;
}

interface UseRealtimeOrdersOptions {
  onNewOrder?: (order: RealtimeOrder) => void;
  channelName?: string;
  silent?: boolean; // true = never play sound on INSERT (e.g. LiveFeed which relies on SoundSubscriber)
}

const MAX_ORDERS = 50;
const RECONNECT_DELAY_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

// ── helpers ────────────────────────────────────────────────────────────────────

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isOrderFromToday(createdAt: string): boolean {
  const today = new Date();
  const d = new Date(createdAt);
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth()    === today.getMonth() &&
    d.getDate()     === today.getDate()
  );
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useRealtimeOrders({
  onNewOrder,
  channelName = "orders-realtime",
  silent = false,
}: UseRealtimeOrdersOptions = {}) {
  const [recentOrders, setRecentOrders] = useState<RealtimeOrder[]>([]);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const sitesCache = useRef<Map<string, SiteInfo>>(new Map());
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  // Refs for props consumed inside the effect — lets the effect stay on [] deps
  // while always reading the latest values from inside the stable closure.
  const channelNameRef = useRef(channelName);
  channelNameRef.current = channelName;
  const silentRef = useRef(silent);
  silentRef.current = silent;

  // Always read the latest sound context without re-running the channel effect
  const soundCtx = useSoundContext();
  const soundCtxRef = useRef(soundCtx);
  soundCtxRef.current = soundCtx;

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

  // Shared row mapper used by both the initial fetch and the visibility refetch
  function mapRows(data: Record<string, unknown>[]): RealtimeOrder[] {
    return data.map((row) => {
      const sites = row.sites as { name: string; color_hex: string } | null;
      const items = row.order_items as Array<{ product_name: string }> | null;
      return {
        id: row.id as string,
        site_id: row.site_id as string,
        woo_order_id: (row.woo_order_id as string | null) ?? null,
        source: row.source as string,
        status: row.status as string,
        total: row.total as number,
        net_profit: (row.net_profit as number | null) ?? null,
        currency: row.currency as string,
        customer_name: (row.customer_name as string | null) ?? null,
        customer_email: (row.customer_email as string | null) ?? null,
        customer_city: (row.customer_city as string | null) ?? null,
        product_type: row.product_type as string,
        payment_type: row.payment_type as string,
        created_at: row.created_at as string,
        updated_at: (row.updated_at as string | null) ?? null,
        site_name: sites?.name ?? "Unknown",
        site_color: sites?.color_hex ?? "#888888",
        product_name: items?.[0]?.product_name ?? null,
        is_late: false,
      };
    });
  }

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

  // ── Effect 1: Load sites + fetch today's orders fresh on mount ────────────────
  useEffect(() => {
    async function init() {
      await loadSites();

      const { data } = await supabaseBrowser
        .from("orders")
        .select("*, sites(name, color_hex), order_items(product_name)")
        .gte("created_at", startOfTodayISO())
        .order("created_at", { ascending: false })
        .limit(MAX_ORDERS);

      setRecentOrders(mapRows((data ?? []) as Record<string, unknown>[]));
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: Realtime channel with auto-reconnect + heartbeat ────────────────
  useEffect(() => {
    // Local mutable state for this effect's lifetime
    let isMounted = true;
    let isReconnecting = false;
    let lastStatus = "";
    let subscribedOnce = false; // prevents heartbeat from firing before first SUBSCRIBED

    // Holds the active channel so cleanup and reconnect always reference the latest one
    let currentChannel: ReturnType<typeof supabaseBrowser.channel>;

    function createChannel(): ReturnType<typeof supabaseBrowser.channel> {
      const ch = supabaseBrowser
        .channel(channelNameRef.current)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          (payload) => {
            console.log("Realtime event: INSERT orders", payload);
            const newRow = payload.new as Record<string, unknown>;
            const siteId = newRow.site_id as string;
            const createdAt = newRow.created_at as string;
            const orderStatus = newRow.status as string;

            const order: RealtimeOrder = {
              ...enrichFromCache(newRow, siteId),
              product_name: null,
              is_late: !isOrderFromToday(createdAt),
            };

            // Play sound — all values read via refs so they're always current
            if (!silentRef.current) {
              const { isMuted, shouldPlay, playSound, settings } = soundCtxRef.current;
              console.log("[Sound] New order received — status:", orderStatus, "| isMuted:", isMuted, "| shouldPlay:", shouldPlay(orderStatus));
              if (!isMuted && shouldPlay(orderStatus)) {
                console.log("[Sound] Playing sound for order status:", orderStatus);
                playSound(settings.volume);
              } else if (isMuted) {
                console.log("[Sound] Sound skipped: muted");
              } else {
                console.log("[Sound] Sound skipped: status", orderStatus, "not in triggerStatuses");
              }
            }

            setRecentOrders((prev) => {
              if (prev.some((o) => o.id === order.id)) return prev;
              return [order, ...prev].slice(0, MAX_ORDERS);
            });
            setNewOrderCount((n) => n + 1);
            onNewOrderRef.current?.(order);

            // Resolve product name async and patch state
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
          lastStatus = status;
          console.log("Realtime status:", status);
          if (err) console.error("Realtime subscription error:", err);

          if (status === "SUBSCRIBED") {
            subscribedOnce = true;
            setIsConnected(true);
          }

          if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            setIsConnected(false);
          }

          if (
            (status === "CLOSED" || status === "CHANNEL_ERROR") &&
            !isReconnecting &&
            isMounted
          ) {
            isReconnecting = true;
            console.log(`Realtime: ${status} — reconnecting in ${RECONNECT_DELAY_MS}ms`);
            setTimeout(() => {
              if (!isMounted) return;
              supabaseBrowser.removeChannel(ch);
              currentChannel = createChannel();
              isReconnecting = false;
            }, RECONNECT_DELAY_MS);
          }
        });

      return ch;
    }

    currentChannel = createChannel();
    console.log(`Realtime: subscribed to ${channelNameRef.current} channel`);

    // Heartbeat: only acts after the channel was SUBSCRIBED at least once,
    // ensuring we don't misfire during the initial handshake
    const heartbeat = setInterval(() => {
      if (!isMounted || !subscribedOnce || isReconnecting) return;
      if (lastStatus !== "SUBSCRIBED") {
        console.log("Realtime heartbeat: channel not SUBSCRIBED, recreating");
        isReconnecting = true;
        supabaseBrowser.removeChannel(currentChannel);
        currentChannel = createChannel();
        isReconnecting = false;
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      isMounted = false;
      setIsConnected(false);
      clearInterval(heartbeat);
      console.log(`Realtime: removing ${channelNameRef.current} channel`);
      supabaseBrowser.removeChannel(currentChannel);
    };
  }, []); // empty deps — must never re-run

  // ── Effect 3: Refetch on tab focus to recover any missed events ───────────────
  useEffect(() => {
    async function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      console.log("Realtime: tab visible — refetching today's orders");

      const { data } = await supabaseBrowser
        .from("orders")
        .select("*, sites(name, color_hex), order_items(product_name)")
        .gte("created_at", startOfTodayISO())
        .order("created_at", { ascending: false })
        .limit(MAX_ORDERS);

      if (data) {
        setRecentOrders(mapRows(data as Record<string, unknown>[]));
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearNewCount = useCallback(() => setNewOrderCount(0), []);

  return { recentOrders, newOrderCount, clearNewCount, isConnected };
}
