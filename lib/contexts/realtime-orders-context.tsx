"use client";

// Single Supabase Realtime channel mounted at layout level.
// All dashboard pages read from this context — no per-page re-subscription.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { useRealtimeOrders, type RealtimeOrder } from "@/lib/hooks/use-realtime-orders";

// ── context type ───────────────────────────────────────────────────────────────

interface RealtimeOrdersContextValue {
  recentOrders: RealtimeOrder[];
  newOrderCount: number;
  clearNewCount: () => void;
  isConnected: boolean;
  /** Register a one-shot callback that fires when a new INSERT order arrives.
   *  Returns a cleanup function — call it in useEffect cleanup to unsubscribe. */
  subscribeToNewOrders: (cb: (order: RealtimeOrder) => void) => () => void;
}

const RealtimeOrdersContext = createContext<RealtimeOrdersContextValue>({
  recentOrders: [],
  newOrderCount: 0,
  clearNewCount: () => {},
  isConnected: false,
  subscribeToNewOrders: () => () => {},
});

// ── provider ───────────────────────────────────────────────────────────────────

export function RealtimeOrdersProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set of callbacks registered by page-level components (e.g. LiveFeed animation)
  const newOrderCallbacksRef = useRef(new Set<(order: RealtimeOrder) => void>());

  // On any order change: revalidate every stats/analytics SWR key (KPIs,
  // sparklines, charts) and router.refresh() the server-rendered OrdersTable.
  // Debounced so a burst of webhook/sync events causes one refetch, not N.
  const triggerRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutate(
        (key) => typeof key === "string" && (key.startsWith("/api/stats/") || key.startsWith("/api/analytics/")),
        undefined,
        { revalidate: true }
      );
      router.refresh();
    }, 1_500);
  }, [router]);

  // Fired on INSERT — forward to all registered page callbacks + trigger refresh
  const handleNewOrder = useCallback(
    (order: RealtimeOrder) => {
      newOrderCallbacksRef.current.forEach((cb) => cb(order));
      triggerRefresh();
    },
    [triggerRefresh]
  );

  // Clean up debounce timer on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Single always-on channel — never recreated as pages navigate in/out
  const { recentOrders, newOrderCount, clearNewCount, isConnected } =
    useRealtimeOrders({
      channelName: "orders-global",
      onNewOrder: handleNewOrder,
      onUpdate: triggerRefresh,
    });

  const subscribeToNewOrders = useCallback(
    (cb: (order: RealtimeOrder) => void) => {
      newOrderCallbacksRef.current.add(cb);
      return () => newOrderCallbacksRef.current.delete(cb);
    },
    []
  );

  return (
    <RealtimeOrdersContext.Provider
      value={{ recentOrders, newOrderCount, clearNewCount, isConnected, subscribeToNewOrders }}
    >
      {children}
    </RealtimeOrdersContext.Provider>
  );
}

// ── consumer hook ──────────────────────────────────────────────────────────────

export function useRealtimeOrdersContext() {
  return useContext(RealtimeOrdersContext);
}
