"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadIcon, PlayIcon, VolumeXIcon, Volume2Icon, TrashIcon } from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────────

interface GlobalSettings {
  enabled: boolean;
  volume: number;
  soundUrl: string | null;
  soundFilename: string | null;
  triggerStatuses: string[];
}

interface SiteOverride {
  useCustom: boolean;
  soundUrl: string | null;
  soundFilename: string | null;
}

interface Site {
  id: string;
  name: string;
  color_hex: string;
}

const TRIGGER_OPTIONS = [
  { status: "processing", label: "Svira za Processing" },
  { status: "completed",  label: "Svira za Completed" },
  { status: "on-hold",    label: "Svira za On-hold" },
];

// ── audio preview (standalone, no hook needed) ────────────────────────────────

async function playPreview(
  url: string | null,
  volumePct: number
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = new ((window as any).AudioContext ?? (window as any).webkitAudioContext)();
  const vol = volumePct / 100;
  const t   = ctx.currentTime;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.connect(ctx.destination);

  if (url) {
    try {
      const res  = await fetch(url);
      const ab   = await res.arrayBuffer();
      const buf  = await ctx.decodeAudioData(ab);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2);
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start(t);
      src.stop(t + 2);
      return;
    } catch {
      // fall through to generated ding
    }
  }

  // Fallback: generated ding (C5 → C6)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(523,  t);
  osc.frequency.setValueAtTime(523,  t + 0.15);
  osc.frequency.linearRampToValueAtTime(1046, t + 0.2);
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + 0.4);
}

// ── upload helper ──────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<{ url: string; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/sound-settings/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error ?? "Upload failed");
  }
  return res.json();
}

// ── UploadZone sub-component ──────────────────────────────────────────────────

function UploadZone({
  soundUrl,
  soundFilename,
  volume,
  onUpload,
  onRemove,
  uploading,
}: {
  soundUrl: string | null;
  soundFilename: string | null;
  volume: number;
  onUpload: (file: File) => void;
  onRemove: () => void;
  uploading?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    onUpload(files[0]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {soundUrl ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "#F0FDF4",
          border: "1px solid #BBF7D0",
          borderRadius: 8,
        }}>
          <Volume2Icon style={{ width: 14, height: 14, color: "#16A34A", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#15803D", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {soundFilename ?? "custom.mp3"}
          </span>
          <button
            onClick={() => playPreview(soundUrl, volume)}
            title="Pusti test"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#16A34A", fontWeight: 500 }}
          >
            <PlayIcon style={{ width: 12, height: 12 }} />
            Test
          </button>
          <button
            onClick={onRemove}
            title="Ukloni"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: 4, color: "#9CA3AF" }}
          >
            <TrashIcon style={{ width: 13, height: 13 }} />
          </button>
        </div>
      ) : null}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#1B6EF3" : "#E4E4E7"}`,
          borderRadius: 8,
          padding: "16px 12px",
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          background: dragging ? "#EBF2FF" : "#FAFAFA",
          transition: "all 150ms",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <UploadIcon style={{ width: 18, height: 18, color: "#A1A1AA", margin: "0 auto 6px" }} />
        <p style={{ fontSize: 12, color: "#A1A1AA", margin: 0 }}>
          {uploading ? "Učitavanje…" : "Klikni ili prevuci MP3/WAV  ·  max 2 MB"}
        </p>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function SoundSettingsPage() {
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [sites,   setSites]     = useState<Site[]>([]);
  const uploadingRef = useRef<Record<string, boolean>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Record<string, boolean>>({});

  const [global, setGlobal] = useState<GlobalSettings>({
    enabled: true,
    volume: 70,
    soundUrl: null,
    soundFilename: null,
    triggerStatuses: ["processing", "completed"],
  });

  const [overrides, setOverrides] = useState<Record<string, SiteOverride>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/sound-settings")
      .then((r) => r.json())
      .then(({ global: g, siteOverrides, sites: s }) => {
        setGlobal(g);
        setOverrides(siteOverrides ?? {});
        setSites(s ?? []);
      })
      .catch(() => setError("Greška pri učitavanju."))
      .finally(() => setLoading(false));
  }, []);

  // ── Upload helpers ────────────────────────────────────────────────────────
  function setUploading(key: string, val: boolean) {
    uploadingRef.current[key] = val;
    setUploadingKeys({ ...uploadingRef.current });
  }

  const handleGlobalUpload = useCallback(async (file: File) => {
    setUploading("global", true);
    setError(null);
    try {
      const { url, filename } = await uploadFile(file);
      setGlobal((prev) => ({ ...prev, soundUrl: url, soundFilename: filename }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading("global", false);
    }
  }, []);

  const handleSiteUpload = useCallback(async (siteId: string, file: File) => {
    setUploading(siteId, true);
    setError(null);
    try {
      const { url, filename } = await uploadFile(file);
      setOverrides((prev) => ({
        ...prev,
        [siteId]: { ...prev[siteId], soundUrl: url, soundFilename: filename },
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(siteId, false);
    }
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Save global
      await fetch("/api/sound-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global }),
      });

      // Save each site override
      for (const [siteId, override] of Object.entries(overrides)) {
        await fetch("/api/sound-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, override: override.useCustom ? override : null }),
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Greška pri čuvanju.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ color: "#A1A1AA", fontSize: 13, padding: "40px 0" }}>Učitavanje…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 600 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0 }}>
          Zvučna obaveštenja
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
          Zvuk koji svira pri novim porudžbinama. Bucket "sounds" mora biti kreiran u Supabase Storage.
        </p>
      </div>

      {/* ── Global sound ─────────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={labelStyle}>Globalni zvuk</p>
            <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>
              Primenjuje se na sve sajtove koji nemaju sopstveni zvuk.
            </p>
          </div>
          <Toggle value={global.enabled} onChange={(v) => setGlobal((p) => ({ ...p, enabled: v }))} />
        </div>

        {/* Upload */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Prilagođeni zvuk</label>
          <div style={{ marginTop: 8 }}>
            <UploadZone
              soundUrl={global.soundUrl}
              soundFilename={global.soundFilename}
              volume={global.volume}
              uploading={uploadingKeys["global"]}
              onUpload={handleGlobalUpload}
              onRemove={() => setGlobal((p) => ({ ...p, soundUrl: null, soundFilename: null }))}
            />
          </div>
          {!global.soundUrl && (
            <button
              onClick={() => playPreview(null, global.volume)}
              style={testBtnStyle}
            >
              <PlayIcon style={{ width: 12, height: 12 }} /> Pusti podrazumevani zvuk
            </button>
          )}
        </div>

        {/* Volume */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={labelStyle}>Jačina zvuka</label>
            <span style={{ fontSize: 12, color: "#71717A", fontWeight: 600 }}>{global.volume}%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <VolumeXIcon style={{ width: 14, height: 14, color: "#A1A1AA", flexShrink: 0 }} />
            <input
              type="range"
              min={0}
              max={100}
              value={global.volume}
              onChange={(e) => setGlobal((p) => ({ ...p, volume: Number(e.target.value) }))}
              style={{ flex: 1, accentColor: "#1B6EF3" }}
            />
            <Volume2Icon style={{ width: 14, height: 14, color: "#A1A1AA", flexShrink: 0 }} />
          </div>
        </div>
      </div>

      {/* ── Trigger statuses ─────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <p style={{ ...labelStyle, marginBottom: 4 }}>Okidač statusa</p>
        <p style={{ fontSize: 12, color: "#A1A1AA", margin: "0 0 16px" }}>
          Zvuk svira samo za nove porudžbine sa ovim statusima.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TRIGGER_OPTIONS.map(({ status, label }) => {
            const checked = global.triggerStatuses.includes(status);
            return (
              <label key={status} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setGlobal((p) => ({
                    ...p,
                    triggerStatuses: checked
                      ? p.triggerStatuses.filter((s) => s !== status)
                      : [...p.triggerStatuses, status],
                  }))}
                  style={{ width: 15, height: 15, accentColor: "#1B6EF3", cursor: "pointer" }}
                />
                <span style={{ fontSize: 13, color: "#18181B" }}>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Per-site overrides ────────────────────────────────────────────── */}
      {sites.length > 0 && (
        <div style={cardStyle}>
          <p style={{ ...labelStyle, marginBottom: 4 }}>Zvuk po sajtu</p>
          <p style={{ fontSize: 12, color: "#A1A1AA", margin: "0 0 16px" }}>
            Svaki sajt može da koristi sopstveni zvuk umesto globalnog.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sites.map((site) => {
              const ov = overrides[site.id] ?? { useCustom: false, soundUrl: null, soundFilename: null };
              return (
                <div key={site.id} style={{
                  border: "1px solid #E4E4E7",
                  borderRadius: 10,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}>
                  {/* Site header row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                        backgroundColor: site.color_hex,
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
                        {site.name}
                      </span>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={ov.useCustom}
                        onChange={(e) => setOverrides((prev) => ({
                          ...prev,
                          [site.id]: { ...ov, useCustom: e.target.checked },
                        }))}
                        style={{ width: 14, height: 14, accentColor: "#1B6EF3", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: 12, color: "#52525B" }}>Prilagođeni zvuk</span>
                    </label>
                  </div>

                  {ov.useCustom && (
                    <UploadZone
                      soundUrl={ov.soundUrl}
                      soundFilename={ov.soundFilename}
                      volume={global.volume}
                      uploading={uploadingKeys[site.id]}
                      onUpload={(file) => handleSiteUpload(site.id, file)}
                      onRemove={() => setOverrides((prev) => ({
                        ...prev,
                        [site.id]: { ...ov, soundUrl: null, soundFilename: null },
                      }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            background: saving ? "#D4D4D8" : "#18181B",
            color: "#fff",
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background 120ms",
          }}
        >
          {saving ? "Čuvanje…" : "Sačuvaj"}
        </button>
        {saved  && <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 500 }}>Sačuvano ✓</span>}
        {error  && <span style={{ fontSize: 13, color: "#DC2626" }}>{error}</span>}
      </div>
    </div>
  );
}

// ── style constants ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E4E4E7",
  borderRadius: 12,
  padding: "20px 24px",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#18181B",
  margin: 0,
};

const testBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginTop: 8,
  fontSize: 12,
  color: "#52525B",
  background: "none",
  border: "1px solid #E4E4E7",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
};

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: value ? "#18181B" : "#E4E4E7",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 200ms",
        flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute",
        top: 3,
        left: value ? 21 : 3,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#fff",
        transition: "left 200ms",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </button>
  );
}
