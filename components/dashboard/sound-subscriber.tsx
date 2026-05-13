"use client";

// Invisible component mounted at dashboard layout level.
// Owns the single realtime subscription responsible for playing sounds on all
// dashboard pages — even when LiveFeed is not in the current page's component tree.
import { useRealtimeOrders } from "@/lib/hooks/use-realtime-orders";

export function SoundSubscriber() {
  useRealtimeOrders({ channelName: "orders-sound-global" });
  return null;
}
