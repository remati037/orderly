"use client";

import { useEffect } from "react";
import { applyTheme } from "@/lib/theme/client";

// Keeps an already open tab on schedule: flips at 20:00/07:00, catches up when
// a sleeping laptop wakes, and follows the switch from other tabs.
export function ThemeSync() {
  useEffect(() => {
    applyTheme();
    const timer = setInterval(applyTheme, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") applyTheme();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", applyTheme);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", applyTheme);
    };
  }, []);
  return null;
}
