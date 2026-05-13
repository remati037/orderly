"use client";

import { Volume2Icon, VolumeXIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSoundContext } from "@/lib/contexts/sound-context";

export function DashboardHeader() {
  const { isMuted, setMuted, unlockAudio } = useSoundContext();

  return (
    <header
      style={{
        height: 44,
        borderBottom: "1px solid #E4E4E7",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 24px",
        flexShrink: 0,
        gap: 4,
      }}
    >
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
                background: isMuted ? "transparent" : "#EBF2FF",
                color: isMuted ? "#A1A1AA" : "#1B6EF3",
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
