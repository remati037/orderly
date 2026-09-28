"use client";

import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";

// Shown in place of a widget whose data request failed, so it doesn't sit on a
// loading skeleton forever (or show a misleading 0).
export function LoadError({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return (
    <div
      role="alert"
      style={{
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: 10,
        padding: compact ? "10px 14px" : "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: "#991B1B",
      }}
    >
      <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
      <span style={{ flex: 1 }}>Greška pri učitavanju podataka.</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#fff",
          border: "1px solid #FECACA",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 500,
          color: "#991B1B",
          cursor: "pointer",
        }}
      >
        <RotateCwIcon className="size-3.5" aria-hidden />
        Pokušaj ponovo
      </button>
    </div>
  );
}
