"use client";

import { Volume2Icon, VolumeXIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSoundContext } from "@/lib/contexts/sound-context";
import { useRealtimeOrdersContext } from "@/lib/contexts/realtime-orders-context";
import { MobileNav } from "./sidebar";
import type { Role } from "@/lib/auth/roles";

export function DashboardHeader({ role, email }: { role: Role; email: string }) {
  const { isMuted, setMuted, unlockAudio } = useSoundContext();
  const { isConnected } = useRealtimeOrdersContext();

  return (
    <header
      style={{
        height: 44,
        borderBottom: "1px solid var(--ui-border)",
        background: "var(--ui-surface)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        flexShrink: 0,
        gap: 4,
      }}
    >
      <MobileNav role={role} email={email} />

      {/* Whether live updates are flowing — numbers may be stale when offline. */}
      <span
        style={{ marginLeft: "auto", marginRight: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: isConnected ? "var(--tone-green)" : "var(--ui-faint)" }}
        title={isConnected ? "Podaci se osvežavaju uživo" : "Veza za osvežavanje uživo je prekinuta"}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: isConnected ? "#22C55E" : "var(--ui-border-strong)" }} />
        {isConnected ? "Uživo" : "Van mreže"}
      </span>

      <Tooltip>
        <TooltipTrigger
          onClick={() => { unlockAudio(); setMuted(!isMuted); }}
          aria-label={isMuted ? "Uključi zvuk" : "Isključi zvuk"}
          render={
            <button
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 6,
                border: "none",
                background: isMuted ? "transparent" : "var(--tone-green-2)",
                color: isMuted ? "var(--ui-faint)" : "var(--tone-green)",
                cursor: "pointer",
                transition: "background 120ms, color 120ms",
              }}
            />
          }
        >
          {isMuted
            ? <VolumeXIcon style={{ width: 15, height: 15 }} />
            : <Volume2Icon style={{ width: 15, height: 15 }} />
          }
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p style={{ fontSize: 12 }}>
            {isMuted ? "Zvučna obaveštenja isključena" : "Zvučna obaveštenja uključena"}
          </p>
        </TooltipContent>
      </Tooltip>
    </header>
  );
}
