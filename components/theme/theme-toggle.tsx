"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { isDarkNow, setDarkManually, subscribeTheme } from "@/lib/theme/client";
import { NIGHT_END_HOUR, NIGHT_START_HOUR } from "@/lib/theme/schedule";

const pad = (hour: number) => String(hour).padStart(2, "0");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDarkNow, () => false);

  return (
    <label
      title={`Sam se pali od ${pad(NIGHT_START_HOUR)}:00 do ${pad(NIGHT_END_HOUR)}:00. Ručni izbor važi do sledeće promene.`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        fontWeight: 500,
        color: "var(--ui-text-3)",
        cursor: "pointer",
        marginBottom: 10,
      }}
    >
      <MoonIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>Noćni režim</span>
      <Switch checked={dark} onCheckedChange={setDarkManually} aria-label="Noćni režim" />
    </label>
  );
}
