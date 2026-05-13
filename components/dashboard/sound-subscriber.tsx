"use client";

// Invisible component mounted at dashboard layout level.
// Owns the single realtime subscription responsible for:
//   1. Playing sounds on all dashboard pages
//   2. Revalidating KPI stats (SWR) immediately when orders change
//   3. Refreshing server components (OrdersTable) with a short debounce
import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { useRealtimeOrders } from "@/lib/hooks/use-realtime-orders";

export function SoundSubscriber() {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOrderChange = useCallback(() => {
    // 1. Immediately revalidate all KPI SWR keys (covers both /api/stats/kpi and ?siteId=... variants)
    mutate((key) => typeof key === "string" && key.startsWith("/api/stats/kpi"), undefined, { revalidate: true });

    // 2. Debounce the server-component refresh so rapid bursts don't hammer the server.
    //    This refreshes OrdersTable and any other server components on the current page.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.refresh();
    }, 2_000);
  }, [router]);

  useRealtimeOrders({
    channelName: "orders-sound-global",
    onNewOrder: handleOrderChange,
    onUpdate: handleOrderChange,
  });

  return null;
}
