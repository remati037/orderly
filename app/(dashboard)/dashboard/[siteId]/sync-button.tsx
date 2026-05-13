"use client";

import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";

interface SyncButtonProps {
  siteId: string;
  platform: string;
}

export function SyncButton({ siteId, platform }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const endpoint =
        platform === "thinkific"
          ? `/api/sync/thinkific/${siteId}`
          : `/api/sync/woo/${siteId}`;
      const res = await fetch(endpoint, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setResult(`Sinhronizovano ${json.synced} porudžbina`);
      } else {
        setResult(json.error ?? "Greška");
      }
    } catch {
      setResult("Greška pri sinhronizaciji");
    } finally {
      setSyncing(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #E4E4E7",
          background: syncing ? "#F4F4F5" : "#fff",
          color: syncing ? "#A1A1AA" : "#18181B",
          cursor: syncing ? "not-allowed" : "pointer",
          transition: "all 120ms",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!syncing) e.currentTarget.style.background = "#F4F4F5";
        }}
        onMouseLeave={(e) => {
          if (!syncing) e.currentTarget.style.background = "#fff";
        }}
      >
        <RefreshCwIcon
          style={{
            width: 14,
            height: 14,
            animation: syncing ? "spin 1s linear infinite" : undefined,
          }}
        />
        {syncing ? "Sinhronizacija…" : "Sinhronizuj"}
      </button>
      {result && (
        <span style={{ fontSize: 11, color: result.startsWith("Grešk") ? "#DC2626" : "#16A34A" }}>
          {result}
        </span>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
